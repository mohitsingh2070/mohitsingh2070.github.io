let toggle = 1;
let button;

function setup() {
  createCanvas(windowWidth,windowHeight);
  background(20, 190, 199);
  textSize(2);
  button = createButton('GOT JEALOUS');
  button.position(width/40, height/40);
  button.mousePressed(changeBG);
}

function draw() {
  if (mouseIsPressed) {
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