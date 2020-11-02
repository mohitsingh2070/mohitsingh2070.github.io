let qrcode;
let div;
let input, button, greeting;
let values;

function setup() {
  createCanvas(720, 800);
  
  song = loadSound('maker.mp3');

  input = createInput();
  input.position(width/2, height/5);

  button = createButton('ACCESS GIVEN');
  button.position(input.x + input.width, height/5);
  button.mousePressed(greet);

  greeting = createElement('h2', 'what is your EMAIL ?');
  greeting.position(width/2, height/10);
  
  div = createDiv("");
  div.id("qrcode");

  div.style("width", "256px");
  div.style("height", "256px");
  div.style("padding", "2px");
  div.style("background-color", "grey");
  div.position(10, 10);
  qrcode = new QRCode("qrcode");
}

function draw() {

  button = createButton('OKAY');
  button.position(400,height/4 );
  button.mousePressed(SUBMIT);
  button = createButton('NOPE');
  button.position(480, height/4);
  button.mousePressed(SAD);

 
}
  
function makeCode() {  
  url=values;
  qrcode.makeCode(url);
  console.log(values);
}
function SAD() {
  
  div.remove();
  div = createDiv("");
  div.id("qrcode");
  div.position(0, 0);
  qrcode = new QRCode("qrcode");
   if (song.isPlaying()) {
  song.stop();}
}
function SUBMIT() {
  makeCode();
 
}
function greet() {
  const name = input.value();
  values=name;
  greeting.html(' THANK YOU ' + name + '!');
  
   if (song.isPlaying()) {
  //  song.stop();
    background(255, 0, 0);
  } else {
    song.play();
    background(0, 255, 0);
  }
}