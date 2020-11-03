let toggle = 1;
let button;
let number=1;
let song;
function loader() {
  
  song = loadSound('lany.mp3');
  frameRate(1);
  //penguin = createCapture(VIDEO);
}
function setup() {
  loader();
  createCanvas(windowWidth,windowHeight);
  background(20, 190, 199);
  textSize(2);

  button = createButton('makeAwish');
  button.position(width/40, height/40);
  button.style('font-size', '60px');
  button.mousePressed(changeBG);
}

function draw() {
  if (mouseIsPressed) {
    frameRate(60);
    if(number==1){
     song.play();
    number+=1;
    }
    strokeWeight(12);
    line(pmouseX, pmouseY, mouseX, mouseY);
    // print(toggle);}

  }
}

function changeBG() {
  background(random(1, 359), random(1, 359), random(1, 359));
}

function mousePressed() {
  if (toggle == 1) {
    toggle = 0;
  } else {
    toggle = 1;
  }
}
