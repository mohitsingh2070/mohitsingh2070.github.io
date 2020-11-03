
let addTrain;
let train;
let mobilenet;
let predictor;
let slider;
let value=0;
let sum;
let label;
let classifier;
//let button;
function preload() {
  
  song = loadSound('singAsong.mp3');
  //penguin = createCapture(VIDEO);
}
let video;
//let imagingButton;
function videoReady(){
  console.log('video is ready');
  
 //mobilenet.predict(gotResult);
}
function modelReady(){
  console.log('model is ready');
  
 //mobilenet.predict(gotResult);
}



// function imageReady(){
//   console.log('image is ready');
// }

let name=""; 

let prob;
function gotResult(error,results){
  if(error){
 console.error(error);
  }
  else{

    value=results.value;
   // console.log(results);
     name=results[0].label;
     //prob=results[0].confidence;
   //  text(value,12,height-15);

   
 
//     createP(`${name}
//  CONFIDENCE IS ${100 * prob}%`);
     mobilenet.classify(gotResult);
   //  predictor.predict(gotResult);
  }
}


function whileTraining(loss){

  if(loss==null){

    console.log("Training COmplete");
     classifier.classify(gotResult);
   // predictor.predict(gotResult);
  }else{
      console.log(loss);

  }

console.log(loss);


}

function setup(){
  
    createCanvas(620,540);
    background(255);
   value+=1;
    video = createCapture(VIDEO);
    video.hide();
  mobilenet=ml5.featureExtractor('MobileNet',modelReady);  
    //  mobilenet=ml5.featureExtractor('MobileNet',modelReady);
    classifier=mobilenet.classification(video,videoReady);
    // predictor=mobilenet.regression(video,videoReady);
 button=createButton(" MODEL 1 ");
 button.mousePressed(function(){

   if(value==1){
     song.play();
    background(0, 255, 0);
     value+=1;
   }
   
classifier.addImage('HELLO ASHUTOSH , FIRST ITEM');

 });

 imagingButton=createButton(" MODEL 2 ");
 imagingButton.mousePressed(function(){

classifier.addImage('SECOND ITEM');

 });

//slider= createSlider(0,1,0.5,0.1);



//addTrain=createButton(" START ");
//addTrain.mousePressed(function(){

 // predictor.addImage(slider.value());


//})

 train=createButton(" Train ");
 train.mousePressed(function(){
  classifier.train(whileTraining);
  //predictor.train(whileTraining);

 });

  }
  function draw(){
    background(0);
image(video,0,0);
fill(255);
    strokeWeight(3)
    textSize(46);
   text(name,12,height-15);
  
   //text(prob,10,height-109);

  }
