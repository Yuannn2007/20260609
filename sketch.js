let video;
let handpose;
let predictions = [];
let modelLoaded = false; // 用於自我檢查模型載入狀態
let gameState = "WAITING"; // 遊戲狀態：WAITING, PLAY, GAMEOVER

let walls = []; // 儲存所有的牆壁物件
let spawnTimer = 0; // 用於計時生成牆壁
let player; // 玩家飛機物件
let score = 0; // 分數
let particles = []; // 儲存碎裂粒子

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
  score = 0;
  particles = [];
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

  // 繪製分數 (左上角，需處理鏡像文字反轉)
  push();
  scale(-1, 1);
  translate(-width, 0);
  fill(0);
  textSize(24);
  text("Score: " + score, 20, 60);
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

      // --- 碰撞與過關檢查 ---
      // 當牆壁底部跨過飛機 Y 軸高度時進行判定
      let wallBottom = walls[i].y + walls[i].h;
      if (!walls[i].passed && wallBottom >= player.y - 10 && wallBottom <= player.y + walls[i].speed + 5) {
        let leftWing = player.x - player.w / 2;
        let rightWing = player.x + player.w / 2;
        let holeL = walls[i].holeX;
        let holeR = walls[i].holeX + walls[i].holeWidth;

        // 檢查機翼是否完全在空洞範圍內
        if (leftWing > holeL && rightWing < holeR) {
          // 成功鑽過
          score++;
          walls[i].passed = true;
          walls[i].shatter(); // 產生碎裂效果
        } else {
          // 撞牆判定
          gameState = "GAMEOVER";
        }
      }

      // 3. 當牆壁掉出畫面底部時移除，釋放記憶體
      if (walls[i].isOffScreen() || (walls[i].passed && walls[i].particlesSpawned)) {
        walls.splice(i, 1);
      }
    }

    // 4. 更新與繪製粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].display();
      if (particles[i].finished()) {
        particles.splice(i, 1);
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
    text("Final Score: " + score, width / 2, height / 2 + 100);
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
    this.passed = false; // 是否已判定過
    this.particlesSpawned = false; // 是否已產生粒子
  }

  update() {
    this.y += this.speed;
  }

  display() {
    if (this.passed) return; // 如果過關了，本體就不再繪製

    fill(0); // 黑色實心牆壁
    noStroke();
    
    // 繪製左側牆壁 (從 0 到 空洞開始)
    rectMode(CORNER);
    rect(0, this.y, this.holeX, this.h);
    
    // 繪製右側牆壁 (從 空洞結束 到 畫布寬度)
    rect(this.holeX + this.holeWidth, this.y, width - (this.holeX + this.holeWidth), this.h);
  }

  shatter() {
    this.particlesSpawned = true;
    // 在牆壁左右兩側產生碎裂粒子
    for (let i = 0; i < 15; i++) {
      // 左側牆碎塊
      particles.push(new Particle(random(0, this.holeX), this.y, 0));
      // 右側牆碎塊
      particles.push(new Particle(random(this.holeX + this.holeWidth, width), this.y, 0));
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

// --- 碎裂粒子類別 ---
class Particle {
  constructor(x, y, col) {
    this.x = x;
    this.y = y;
    this.vx = random(-2, 2);
    this.vy = random(-2, 5);
    this.alpha = 255;
    this.color = col;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 10; // 逐漸消失
  }

  display() {
    noStroke();
    fill(this.color, this.alpha);
    ellipse(this.x, this.y, 8);
  }

  finished() {
    return this.alpha <= 0;
  }
}
