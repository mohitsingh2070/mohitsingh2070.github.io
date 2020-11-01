let fireworks = [];
let gravity;
let delay=0;
let qrcode; 
let div;

//function preload(){
  
  // song = loadSound('songPlay.mp3');
  //play().time(2);
 // song = createAudio('songPlay.mp3');
//}


function setup() {
  
  createCanvas(windowWidth,windowHeight);
    //song.loop();
 // song.play();
  // song.play().time(0);
  // song.play().time(9);
  colorMode(HSB);
  gravity = createVector(0, 0.2);
  stroke(255);
  strokeWeight(4);
  background(0);
  textSize(80);
  text  ("WAIT  .....", width/2-100, height/2);
  frameRate(12);
}

function draw() {
  if(delay>2){
    frameRate(60);
  colorMode(RGB);
  background(0, 25);
  if (random(1) < 0.03) {
    fireworks.push(new Firework());
  }
  for (var i = fireworks.length - 1; i >= 0 ; i--) {
    fireworks[i].update();
    fireworks[i].show();
    if(fireworks[i].done()) {
      fireworks.splice(i, 1);
    }
  }
  
  colorMode(RGB);
  textAlign(CENTER);
  textSize(70);
  noStroke();
  fill(0, 200, 255);
  text  ("Is There Any Chance ,", width/2, height/2);
  text  ("I could Get Your Email ID ?", width/2, height/2+105);
  }
  else {frameRate(2);
  delay+=1;}
}
