let fireworks = [];
let gravity;
let delay=0;
let last;
let mySound;

function preload() {
 
  mySound = loadSound('songPlay.mp3');
  
}

function play(){
  
  mySound.play();  
  
  
}

function setup() {
  createCanvas(windowWidth,windowHeight);
  colorMode(HSB);
  gravity = createVector(0, 0.2);
  stroke(255);
  strokeWeight(4);
  background(0);
  textSize(80);
  text  ("WAIT  .....", width/2-100, height/2);
  frameRate(2);
 
  fill(255);
  textAlign(CENTER);
   last=createP("You are entering finale of 2020 (click me)");
  last.style('font-size', '40px');
  last.style('background','purple');
 last.style('color', 'white');
  last.style('text-align',' center');
    last.style('padding',' 20px');
  last.mouseClicked(play);
  
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
  text  ("I Saw Something Was Burning ,", width/2, height/2);
  text  (" I hope its your Bad Luck ", width/2, height/2+105);
   
  }
  else {frameRate(2);
  delay+=1;}
}
