let toggle = 1;
let button;
let number=1;
let song;
//function preload() {
  
 // song = loadSound('lany.mp3');
  //penguin = createCapture(VIDEO);
//}
function setup() {
  createCanvas(windowWidth,windowHeight);
  song = loadSound('lany.mp3');
  background(20, 190, 199);
  textSize(2);

  button = createButton('makeAwish');
  button.position(width/40, height/40);
  button.style('font-size', '60px');
  button.mousePressed(changeBG);
}

function draw() {
  if (mouseIsPressed) {
    
    if(song.isLoaded()){
      if(number==1){
      song.play();
        number+=1;
    }}
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
