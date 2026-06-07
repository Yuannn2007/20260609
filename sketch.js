let video;
let handpose;
let predictions = [];
let modelLoaded = false; // 用於自我檢查模型載入狀態
let gameState = "WAITING"; // 遊戲狀態：WAITING, PLAY, GAMEOVER

let walls = []; // 儲存所有的牆壁物件
let spawnTimer = 0; // 用於計時生成牆壁
let player; // 玩家飛機物件

function setup() {
  createCanvas(windowWidth, windowHeight);
  video = createCapture(VIDEO);
  video.size(width, height);

  // 1. 初始化 Handpose 模型 (修正：v1.x 版為 handPose，大寫 P)
  handpose = ml5.handPose(video, () => {
    modelLoaded = true;
    console.log("Model Ready!");
    // 2. 修正：v1.x 建議使用 detectStart 來啟動持續偵測
    handpose.detectStart(video, (results) => {
      predictions = results;
    });
  });

  // 隱藏原始的 HTML 影片元件，我們要在畫布上繪製
  video.hide();

  // 初始化球與磚塊
  resetGame();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  video.size(width, height);
}

function resetGame() {
  gameState = "WAITING";
  walls = [];
  spawnTimer = 0;
  player = new Airplane();
}

function draw() {
  // 確保每一幀都先清空畫布，避免產生黃色軌跡
  background(255);

  // 1. 處理水平鏡像：將畫布原點移至右側並翻轉 X 軸
  translate(width, 0);
  scale(-1, 1);

  // 繪製攝影機畫面
  image(video, 0, 0, width, height);

  // 2. 偵測邏輯
  if (predictions.length > 0) {
    // 取得第一隻偵測到的手
    let hand = predictions[0];
    
    // 3. 更新食指尖端座標 (新版資料結構：hand.index_finger_tip)
    let indexFinger = hand.index_finger_tip;
    
    // 在食指尖端畫一個小圓點，方便確認偵測位置
    fill(0, 255, 0);
    noStroke();
    ellipse(indexFinger.x, indexFinger.y, 15, 15);

    // 如果在遊戲中，更新飛機位置
    if (gameState === "PLAY") {
      player.update(indexFinger.x);
    }

    // 檢查是否「手部打開」以重新開始遊戲
    if (gameState === "GAMEOVER") {
      let isOpen = hand.index_finger_tip.y < hand.index_finger_pip.y &&
                   hand.middle_finger_tip.y < hand.middle_finger_pip.y &&
                   hand.ring_finger_tip.y < hand.ring_finger_pip.y &&
                   hand.pinky_finger_tip.y < hand.pinky_finger_pip.y;
      
      if (isOpen) {
        resetGame();
        gameState = "PLAY";
      }
    }

    // 如果目前在等待狀態且偵測到手，就開始遊戲
    if (gameState === "WAITING") {
      gameState = "PLAY";
    }
  }

  // 自我檢查 UI (不論遊戲狀態，都顯示在最上層)
  push();
  scale(-1, 1);
  translate(-width, 0);
  fill(0);
  textSize(14);
  textAlign(LEFT);
  let statusText = !modelLoaded ? "🔄 模型載入中..." : (predictions.length > 0 ? "✅ 偵測中 (手部已發現)" : "❌ 未偵測到手部");
  text("狀態: " + statusText, 20, 30);
  pop();

  if (gameState === "WAITING") {
    // 等待偵測的畫面
    push();
    scale(-1, 1);
    translate(-width, 0);
    fill(0);
    textAlign(CENTER);
    textSize(24);
    text(!modelLoaded ? "Model Loading..." : "Ready! Please show your hand.", width / 2, height / 2);
    textSize(16);
    text("Please show your hand to the camera to start", width / 2, height / 2 + 40);
    pop();
  } else if (gameState === "PLAY") {
    // 1. 每隔一段時間生成一堵牆 (例如每 120 幀，約 2 秒)
    if (frameCount % 100 === 0) {
      walls.push(new Wall());
    }

    // 2. 更新與繪製所有牆壁
    for (let i = walls.length - 1; i >= 0; i--) {
      walls[i].update();
      walls[i].display();

      // 3. 當牆壁掉出畫面底部時移除，釋放記憶體
      if (walls[i].isOffScreen()) {
        walls.splice(i, 1);
      }
    }

    // 3. 繪製飛機
    player.display();
  } else {
    // 遊戲結束畫面 (需要處理鏡像文字問題)
    push();
    scale(-1, 1); // 再次翻轉回來讓文字正常
    translate(-width, 0);
    fill(0); // 將文字改為黑色
    textAlign(CENTER);
    textSize(48);
    text("GAME OVER", width / 2, height / 2);
    textSize(20);
    text("Open Hand to Restart", width / 2, height / 2 + 50);
    pop();
  }
}

// --- 巨牆類別設計 ---
class Wall {
  constructor() {
    this.y = -50; // 從畫面上方外開始掉落
    this.h = 40;  // 牆壁的厚度
    this.speed = 4; // 固定的掉落速度
    this.holeWidth = 150; // 空洞的寬度
    // 隨機產生空洞的 X 座標位置，確保空洞完全在畫面內
    this.holeX = random(0, width - this.holeWidth);
    this.passed = false; // 是否已安全通過
    this.alpha = 255;    // 用於過關後的漸變消失
  }

  update() {
    this.y += this.speed;
    if (this.passed) this.alpha -= 20; // 過關後迅速淡出
  }

  display() {
    fill(0, this.alpha); // 黑色實心牆壁 (支援透明度)
    noStroke();
    
    // 繪製左側牆壁 (從 0 到 空洞開始)
    rectMode(CORNER);
    rect(0, this.y, this.holeX, this.h);
    
    // 繪製右側牆壁 (從 空洞結束 到 畫布寬度)
    rect(this.holeX + this.holeWidth, this.y, width - (this.holeX + this.holeWidth), this.h);
  }

  createShatterEffect() {
    // 在牆壁位置產生一些灰色半透明粒子
    for (let i = 0; i < 10; i++) {
      particles.push(new Particle(this.holeX - 20, this.y, color(150, 150, 150, 150), 5));
      particles.push(new Particle(this.holeX + this.holeWidth + 20, this.y, color(150, 150, 150, 150), 5));
    }
  }

  isOffScreen() {
    return this.y > height;
  }
}

// --- 飛機類別設計 ---
class Airplane {
  constructor() {
    this.x = width / 2;
    this.y = height - 80; // 固定在畫面底部上方一點點
    this.w = 60; // 翼展寬度
  }

  update(targetX) {
    // 讓飛機平滑地跟隨食指 (可直接設定 this.x = targetX)
    this.x = targetX;
  }

  display() {
    if (gameState === "GAMEOVER") return; // 炸毀後不顯示

    push();
    translate(this.x, this.y);
    
    // 繪製機翼
    fill(150); // 灰色機翼
    rectMode(CENTER);
    rect(0, 5, this.w, 10, 2); 
    
    // 繪製機身 (三角形)
    fill(255, 0, 0); // 紅色機身
    triangle(-15, 20, 15, 20, 0, -20);
    pop();
  }
}

// --- 粒子類別設計 ---
class Particle {
  constructor(x, y, col, size) {
    this.x = x;
    this.y = y;
    this.vx = random(-4, 4);
    this.vy = random(-4, 4);
    this.alpha = 255;
    this.color = col;
    this.size = size;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 10;
  }

  display() {
    noStroke();
    let c = color(red(this.color), green(this.color), blue(this.color), this.alpha);
    fill(c);
    ellipse(this.x, this.y, this.size);
  }

  finished() {
    return this.alpha <= 0;
  }
}
