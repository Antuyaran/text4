// --- 配置参数 ---
const MAX_CUTS = 10;               // 自动切割最大次数
const CUT_INTERVAL = 1000;         // 每 1 秒 (1000ms) 切割一次
const LINE_COLOR = '#8ed2f2';      // 系统设定蓝色
const TEXT_COLOR = '#b7a180';      // 阅读系统文本色
const BG_COLOR = '#ffffff';        // 阅读系统纯白背景
const FONT_SIZE = 19;
const LINE_HEIGHT = 20;
const PARAGRAPH_MARGIN = 25;       // 段落间距

let polygons = [];
let cutLines = [];
let textTokens = [];
let lastCutTime = 0;
let scrollOffset = 0;

function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('canvas-container');

    // 1. 获取 DOM 中的文本并按段落处理
    let pTags = document.querySelectorAll('#source-text p');
    let sourceText = Array.from(pTags).map(p => p.innerText).join('\n\n'); 
    
    // 隐藏原始 DOM 文本的颜色
    document.getElementById('source-text').style.color = 'transparent';

    // 2. 监听文本容器的滚动事件，实现 Canvas 与 DOM 同步滚动
    document.getElementById('text-container').addEventListener('scroll', function(e) {
        scrollOffset = e.target.scrollTop;
    });

    // 3. 初始多边形
    polygons.push([
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height * 3 }, 
        { x: 0, y: height * 3 }
    ]);

    // 4. 分词（保留换行符用于段落判断）
    textTokens = sourceText.match(/\n|[\w.,!?'"()-]+|\s+|[\u4e00-\u9fa5]|[^\w\s]/g) || [];

    // 设置字体 DNA
    textFont('"PingFang SC Light", "PingFang SC", "Helvetica Neue", Arial, sans-serif');
    
    lastCutTime = millis();
}

function draw() {
    clear(); 
    background(BG_COLOR);

    // --- 自动切割逻辑 ---
    if (millis() - lastCutTime > CUT_INTERVAL && cutLines.length < MAX_CUTS) {
        let pt = createVector(random(width * 0.1, width * 0.9), random(height * 0.1, height * 0.9));
        let angle = random(TWO_PI);
        executeCut(pt, angle);
        lastCutTime = millis();
    }

    push();
    // 应用滚动偏移
    translate(0, -scrollOffset);

    // 动态计算 Responsive Padding
    let padX = constrain(windowWidth * 0.05, 20, 60); 
    let padY = constrain(windowHeight * 0.06, 20, 60); 
    let maxTextWidth = 800;
    
    let leftBound = padX;
    let rightBound = min(width - padX, padX + maxTextWidth);

    // ==========================================
    // 新增逻辑：对碎片容器进行排序，确保阅读顺序
    // ==========================================
    let sortedPolys = polygons.slice().sort((a, b) => {
        let minY_a = Math.min(...a.map(p => p.y));
        let minY_b = Math.min(...b.map(p => p.y));
        let minX_a = Math.min(...a.map(p => p.x));
        let minX_b = Math.min(...b.map(p => p.x));

        // 如果两个碎片的顶部在几乎同一水平线上（误差两行文字内），则从左到右排
        if (Math.abs(minY_a - minY_b) < LINE_HEIGHT * 2) {
            return minX_a - minX_b;
        }
        // 否则严格从上到下排
        return minY_a - minY_b;
    });

    // ==========================================
    // 新增逻辑：全局进度接力
    // ==========================================
    let currentTokenIdx = 0; // 从头开始

    for (let poly of sortedPolys) {
        // 每次渲染完一个碎片后，将返回的进度传递给下一个碎片
        currentTokenIdx = renderTextInPoly(poly, leftBound, rightBound, padY, currentTokenIdx);
        
        // 如果所有的文字都已经排版完了，就可以提前结束循环
        if (currentTokenIdx >= textTokens.length) break; 
    }

    // 绘制 #8ed2f2 的蓝线
    stroke(LINE_COLOR);
    strokeWeight(1.5);
    for (let l of cutLines) {
        line(l.p1.x, l.p1.y, l.p2.x, l.p2.y);
    }
    pop();
}

// --- 几何切割核心算法 ---
function executeCut(pt, angle) {
    let dir = createVector(cos(angle), sin(angle));
    let normal = { x: -dir.y, y: dir.x };
    let invNormal = { x: dir.y, y: -dir.x };

    let nextPolys = [];
    for (let poly of polygons) {
        let sideA = clip(poly, pt, normal);
        let sideB = clip(poly, pt, invNormal);
        if (sideA.length > 2 && sideB.length > 2) {
            nextPolys.push(sideA, sideB);
        } else {
            nextPolys.push(poly);
        }
    }
    polygons = nextPolys;
    
    let len = max(width, height) * 4;
    cutLines.push({
        p1: { x: pt.x + dir.x * len, y: pt.y + dir.y * len },
        p2: { x: pt.x - dir.x * len, y: pt.y - dir.y * len }
    });
}

function clip(poly, lp, n) {
    let res = [];
    for (let i = 0; i < poly.length; i++) {
        let p = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
        let d = (p.x - lp.x) * n.x + (p.y - lp.y) * n.y;
        let pd = (prev.x - lp.x) * n.x + (prev.y - lp.y) * n.y;
        if (d >= 0) {
            if (pd < 0) res.push(intersect(prev, p, lp, n));
            res.push(p);
        } else if (pd >= 0) {
            res.push(intersect(prev, p, lp, n));
        }
    }
    return res;
}

function intersect(p1, p2, lp, n) {
    let dx = p2.x - p1.x, dy = p2.y - p1.y;
    let t = ((lp.x - p1.x) * n.x + (lp.y - p1.y) * n.y) / (dx * n.x + dy * n.y);
    return { x: p1.x + t * dx, y: p1.y + t * dy };
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    polygons = [[
        { x: 0, y: 0 }, { x: width, y: 0 },
        { x: width, y: height * 3 }, { x: 0, y: height * 3 }
    ]];
    cutLines = [];
    lastCutTime = millis();
}

// --- 在碎片中自适应接力排版 ---
// 接收 startTokenIdx 并且返回排版完成后的最终 index
function renderTextInPoly(poly, leftBound, rightBound, topPadY, startTokenIdx) {
    fill(TEXT_COLOR);
    noStroke();
    textSize(FONT_SIZE);
    textStyle(NORMAL);
    
    let minY = Math.min(...poly.map(p => p.y));
    let maxY = Math.max(...poly.map(p => p.y));
    
    let startY = max(minY, topPadY); 
    let tokenIdx = startTokenIdx; // 接力当前的进度

    let y = startY + FONT_SIZE;
    
    while (y < maxY && tokenIdx < textTokens.length) {
        let xStarts = [];
        let checkY = y - FONT_SIZE * 0.3; 
        
        for (let i = 0; i < poly.length; i++) {
            let p1 = poly[i], p2 = poly[(i + 1) % poly.length];
            if ((p1.y <= checkY && p2.y > checkY) || (p2.y <= checkY && p1.y > checkY)) {
                xStarts.push(p1.x + (checkY - p1.y) * (p2.x - p1.x) / (p2.y - p1.y));
            }
        }
        
        if (xStarts.length >= 2) {
            xStarts.sort((a, b) => a - b);
            
            let curX = max(xStarts[0] + 4, leftBound); 
            let maxX = min(xStarts[1] - 4, rightBound);
            
            // 跳过行首可能存在的连续空格
            while (tokenIdx < textTokens.length && textTokens[tokenIdx].trim() === '' && textTokens[tokenIdx] !== '\n') {
                tokenIdx++;
            }

            while (tokenIdx < textTokens.length) {
                let token = textTokens[tokenIdx];
                
                if (token === '\n') {
                    y += (PARAGRAPH_MARGIN - LINE_HEIGHT); 
                    tokenIdx++;
                    break; 
                }

                let tw = textWidth(token);
                
                // 空间充足，放入容器，进度推进一步
                if (curX + tw <= maxX) {
                    text(token, curX, y);
                    curX += tw;
                    tokenIdx++;
                } else {
                    break; // 此行空间不足，自动回行
                }
            }
        }
        y += LINE_HEIGHT;
    }
    
    // 把装不下的文本进度返回，留给下一个多边形继续装
    return tokenIdx; 
}