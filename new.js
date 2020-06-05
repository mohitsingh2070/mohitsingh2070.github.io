function setup() {
    noCanvas();
    const counter1 =new counter(100,110);
    //counter1.start;
     const counter12=new counter(200,210);
   // counter2.start;
  }
  class counter{
    constructor(start,wait){
    this.count=start;
      this.wait=wait;
      this.p=createP('');
    
    
  
  setInterval(() => {
  this.count++;
  this.p.html(this.count);},wait);
  }
  }  
    
  
  