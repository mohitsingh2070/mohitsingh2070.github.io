
let train;
let mobilenet;
let classifier;
let button;

let video;
let imagingButton;

function videoReady() {
  console.log('video is ready');

  //mobilenet.predict(gotResult);
}

function modelReady() {
  console.log('model is ready');

  //mobilenet.predict(gotResult);
}


let name = "";
let prob;

function gotResult(error, results) {
  if (error) {
    console.error(error);
  } else {
    // console.log(results);
   // name = results[0].label;
   // prob = results[0].confidence;

    //     createP(`${name}
    //  CONFIDENCE IS ${100 * prob}%`);
  
  classifier.classify(gotResult);
}
}


function whileTraining(loss) {

  if (loss == null) {

    console.log("Training COmplete");
    classifier.classify(gotResult);
  } else {
    console.log(loss);

  }

  console.log(loss);


}

function setup() {

  createCanvas(620, 540);
  background(255);

  video = createCapture(VIDEO);
  video.hide();
  mobilenet = ml5.featureExtractor('MobileNet', modelReady);
  classifier = mobilenet.classification(video, videoReady);
 
  
  button = createButton(" MODEL 1 ");
  button.mousePressed(function() {
    classifier.addImage('AWESOME GUY MS');
  });

  
  
  imagingButton = createButton(" MODEL 2");
  imagingButton.mousePressed(function() {
    classifier.addImage('MODEL 2WO');
  });
  
  
  train = createButton(" Train ");
  train.mousePressed(function() {
    classifier.train(whileTraining);

  });

  
   save=createButton(" SAVE ");
 save.mousePressed(function(){

 classifier.save();

 });


}



  function draw() {
    background(0);
    image(video, 0, 0);
    fill(255);
    strokeWeight(3)
    textSize(46);
    text(name, 10, height - 15);
    // print(count);
    //text(prob,10,height-109);

  }