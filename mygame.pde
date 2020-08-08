



private static final float IDEAL_FRAME_RATE = 60.0;
private static final int INTERNAL_CANVAS_SIDE_LENGTH = 640;
private static final boolean USE_WEB_FONT = false;

KeyInput currentKeyInput;
GameSystem system;
PFont smallFont, largeFont;
boolean paused;

int canvasSideLength = INTERNAL_CANVAS_SIDE_LENGTH;
float scaleFactor;



canvasSideLength = min(window.innerWidth, window.innerHeight);



void setup() {

  size(canvasSideLength, canvasSideLength);

  scaleFactor = (float)canvasSideLength / (float)INTERNAL_CANVAS_SIDE_LENGTH;

  frameRate(IDEAL_FRAME_RATE);


  final String fontFilePath = "Lato-Regular.ttf";
  final String fontName = "Lato";
  smallFont = createFont(USE_WEB_FONT ? fontName : fontFilePath, 20.0, true);
  largeFont = createFont(USE_WEB_FONT ? fontName : fontFilePath, 96.0, true);
  textFont(largeFont, 96.0);
  textAlign(CENTER, CENTER);

  rectMode(CENTER);
  ellipseMode(CENTER);

  currentKeyInput = new KeyInput();
  
  newGame(true, true); 
}

void draw() {
  background(255.0);
  scale(scaleFactor);
  system.run();
}

void newGame(boolean demo, boolean instruction) {
  system = new GameSystem(demo, instruction);
}

void mousePressed() {
  system.showsInstructionWindow = !system.showsInstructionWindow;
}



abstract class Body
{
  float xPosition, yPosition;
  float xVelocity, yVelocity;
  float directionAngle;
  float speed;

  void update() {
    xPosition += xVelocity;
    yPosition += yVelocity;
  }
  abstract void display();

  void setVelocity(float dir, float spd) {
    directionAngle = dir;
    speed = spd;
    xVelocity = speed * cos(dir);
    yVelocity = speed * sin(dir);
  }
  
  float getDistance(Body other) {
    return dist(this.xPosition, this.yPosition, other.xPosition, other.yPosition);
  }
  float getDistancePow2(Body other) {
    return sq(other.xPosition - this.xPosition) + sq(other.yPosition - this.yPosition);
  }
  float getAngle(Body other) {
    return atan2(other.yPosition - this.yPosition, other.xPosition - this.xPosition);
  }
}

abstract class Actor
  extends Body
{
  ActorGroup group;
  float rotationAngle;
  final float collisionRadius;

  Actor(float _collisionRadius) {
    collisionRadius = _collisionRadius;
  }

  abstract void act();

  boolean isCollided(Actor other) {
    return getDistance(other) < this.collisionRadius + other.collisionRadius;
  }
}


abstract class AbstractPlayerActor
  extends Actor
{
  final PlayerEngine engine;
  PlayerActorState state;

  AbstractPlayerActor(float _collisionRadius, PlayerEngine _engine) {
    super(_collisionRadius);
    engine = _engine;
  }

  boolean isNull() {
    return false;
  }
}

final class NullPlayerActor
  extends AbstractPlayerActor
{
  NullPlayerActor() {
    super(0.0, null);
  }

  void act() {
  }
  void display() {
  }
  boolean isNull() {
    return true;
  }
}

final class PlayerActor
  extends AbstractPlayerActor
{
  final float bodySize = 32.0;
  final float halfBodySize = bodySize * 0.5;
  final color fillColor;

  float aimAngle;
  int chargedFrameCount;
  int damageRemainingFrameCount;

  PlayerActor(PlayerEngine _engine, color col) {
    super(16.0, _engine);
    fillColor = col;
  }

  void addVelocity(float xAcceleration, float yAcceleration) {
    xVelocity = constrain(xVelocity + xAcceleration, -10.0, 10.0);
    yVelocity = constrain(yVelocity + yAcceleration, -7.0, 7.0);
  }

  void act() {
    engine.run(this);
    state.act(this);
  }

  void update() {
    super.update();

    if (xPosition < halfBodySize) {
      xPosition = halfBodySize;
      xVelocity = -0.5 * xVelocity;
    }
    if (xPosition > INTERNAL_CANVAS_SIDE_LENGTH - halfBodySize) {
      xPosition = INTERNAL_CANVAS_SIDE_LENGTH - halfBodySize;
      xVelocity = -0.5 * xVelocity;
    }
    if (yPosition < halfBodySize) {
      yPosition = halfBodySize;
      yVelocity = -0.5 * yVelocity;
    }
    if (yPosition > INTERNAL_CANVAS_SIDE_LENGTH - halfBodySize) {
      yPosition = INTERNAL_CANVAS_SIDE_LENGTH - halfBodySize;
      yVelocity = -0.5 * yVelocity;
    }

    xVelocity = xVelocity * 0.92;
    yVelocity = yVelocity * 0.92;

    rotationAngle += (0.1 + 0.04 * (sq(xVelocity) + sq(yVelocity))) * TWO_PI / IDEAL_FRAME_RATE;
  }

  void display() {
    stroke(0.0);
    fill(fillColor);
    pushMatrix();
    translate(xPosition, yPosition);
    pushMatrix();
    rotate(rotationAngle);
    rect(0.0, 0.0, 32.0, 32.0);
    popMatrix();
    state.displayEffect(this);
    popMatrix();
  }
}



abstract class AbstractArrowActor
  extends Actor
{
  final float halfLength;

  AbstractArrowActor(float _collisionRadius, float _halfLength) {
    super(_collisionRadius);
    halfLength = _halfLength;
  }

  void update() {
    super.update();
    if (
      xPosition < -halfLength ||
      xPosition > INTERNAL_CANVAS_SIDE_LENGTH + halfLength ||
      yPosition < -halfLength ||
      yPosition > INTERNAL_CANVAS_SIDE_LENGTH + halfLength
    ) {
      group.removingArrowList.add(this);
    }
  }

  abstract boolean isLethal();
}

class ShortbowArrow
  extends AbstractArrowActor
{
  final float terminalSpeed;

  final float halfHeadLength = 8.0;
  final float halfHeadWidth = 4.0;
  final float halfFeatherWidth = 4.0;
  final float featherLength = 8.0;

  ShortbowArrow() {
    super(8.0, 20.0);
    terminalSpeed = 8.0;
  }

  void update() {
    xVelocity = speed * cos(directionAngle);
    yVelocity = speed * sin(directionAngle);
    super.update();

    speed += (terminalSpeed - speed) * 0.1;
  }

  void act() {
    if (random(1.0) < 0.5 == false) return;

    final float particleDirectionAngle = this.directionAngle + PI + random(-QUARTER_PI, QUARTER_PI);
    for (int i = 0; i < 3; i++) {
      final float particleSpeed = random(0.5, 2.0);
      final Particle newParticle = system.commonParticleSet.builder
        .type(1)  
        .position(this.xPosition, this.yPosition)
        .polarVelocity(particleDirectionAngle, particleSpeed)
        .particleSize(2.0)
        .particleColor(color(192.0))
        .lifespanSecond(0.5)
        .build();
      system.commonParticleSet.particleList.add(newParticle);
    }
  }

  void display() {
    stroke(0.0);
    fill(0.0);
    pushMatrix();
    translate(xPosition, yPosition);
    rotate(rotationAngle);
    line(-halfLength, 0.0, halfLength, 0.0);
    quad(
      halfLength, 0.0, 
      halfLength - halfHeadLength, -halfHeadWidth, 
      halfLength + halfHeadLength, 0.0, 
      halfLength - halfHeadLength, +halfHeadWidth
      );
    line(-halfLength, 0.0, -halfLength - featherLength, -halfFeatherWidth);
    line(-halfLength, 0.0, -halfLength - featherLength, +halfFeatherWidth);
    line(-halfLength + 4.0, 0.0, -halfLength - featherLength + 4.0, -halfFeatherWidth);
    line(-halfLength + 4.0, 0.0, -halfLength - featherLength + 4.0, +halfFeatherWidth);
    line(-halfLength + 8.0, 0.0, -halfLength - featherLength + 8.0, -halfFeatherWidth);
    line(-halfLength + 8.0, 0.0, -halfLength - featherLength + 8.0, +halfFeatherWidth);
    popMatrix();
  }

  boolean isLethal() {
    return false;
  }
}

abstract class LongbowArrowComponent
  extends AbstractArrowActor
{
  LongbowArrowComponent() {
    super(16.0, 16.0);
  }

  void act() {
    final float particleDirectionAngle = this.directionAngle + PI + random(-HALF_PI, HALF_PI);
    for (int i = 0; i < 5; i++) {
      final float particleSpeed = random(2.0, 4.0);
      final Particle newParticle = system.commonParticleSet.builder
        .type(1)  
        .position(this.xPosition, this.yPosition)
        .polarVelocity(particleDirectionAngle, particleSpeed)
        .particleSize(4.0)
        .particleColor(color(64.0))
        .lifespanSecond(1.0)
        .build();
      system.commonParticleSet.particleList.add(newParticle);
    }
  }

  boolean isLethal() {
    return true;
  }
}

final class LongbowArrowHead
  extends LongbowArrowComponent
{
  final float halfHeadLength = 24.0;
  final float halfHeadWidth = 24.0;

  LongbowArrowHead() {
    super();
  }

  void display() {
    strokeWeight(5.0);
    stroke(0.0);
    fill(0.0);
    pushMatrix();
    translate(xPosition, yPosition);
    rotate(rotationAngle);
    line(-halfLength, 0.0, 0.0, 0.0);
    quad(
      0.0, 0.0, 
      -halfHeadLength, -halfHeadWidth, 
      +halfHeadLength, 0.0, 
      -halfHeadLength, +halfHeadWidth
      );
    popMatrix();
    strokeWeight(1.0);
  }
}

final class LongbowArrowShaft
  extends LongbowArrowComponent
{
  LongbowArrowShaft() {
    super();
  }

  void display() {
    strokeWeight(5.0);
    stroke(0.0);
    fill(0.0);
    pushMatrix();
    translate(xPosition, yPosition);
    rotate(rotationAngle);
    line(-halfLength, 0.0, halfLength, 0.0);
    popMatrix();
    strokeWeight(1.0);
  }
}



final class Particle
  extends Body
  implements Poolable
{
  
  boolean allocatedIndicator;
  ObjectPool belongingPool;
  int allocationIdentifier;  

  float rotationAngle;
  color displayColor;
  float strokeWeightValue;
  float displaySize;

  int lifespanFrameCount;
  int properFrameCount;
  int particleTypeNumber;

 
  public boolean isAllocated() { 
    return allocatedIndicator;
  }
  public void setAllocated(boolean indicator) { 
    allocatedIndicator = indicator;
  }
  public ObjectPool getBelongingPool() { 
    return belongingPool;
  }
  public void setBelongingPool(ObjectPool pool) { 
    belongingPool = pool;
  }
  public int getAllocationIdentifier() { 
    return allocationIdentifier;
  }
  public void setAllocationIdentifier(int id) { 
    allocationIdentifier = id;
  }
  public void initialize() {
    xPosition = 0.0;
    yPosition = 0.0;
    xVelocity = 0.0;
    yVelocity = 0.0;
    directionAngle = 0.0;
    speed = 0.0;

    rotationAngle = 0.0;
    displayColor = color(0.0);
    strokeWeightValue = 1.0;
    displaySize = 10.0;

    lifespanFrameCount = 0;
    properFrameCount = 0;
    particleTypeNumber = 0;
  }


  void update() {
    super.update();

    xVelocity = xVelocity * 0.98;
    yVelocity = yVelocity * 0.98;

    properFrameCount++;
    if (properFrameCount > lifespanFrameCount) system.commonParticleSet.removingParticleList.add(this);

    switch(particleTypeNumber) {
    case 1:    
      rotationAngle += 1.5 * TWO_PI / IDEAL_FRAME_RATE;
      break;
    default:
      break;
    }
  }

  float getProgressRatio() {
    return min(1.0, float(properFrameCount) / lifespanFrameCount);
  }
  float getFadeRatio() {
    return 1.0 - getProgressRatio();
  }

  void display() {
    switch(particleTypeNumber) {
    case 0: 
      set(int(xPosition), int(yPosition), color(128.0 + 127.0 * getProgressRatio()));
      break;
    case 1:  
      noFill();
      stroke(displayColor, 255.0 * getFadeRatio());
      pushMatrix();
      translate(xPosition, yPosition);
      rotate(rotationAngle);
      rect(0.0, 0.0, displaySize, displaySize);
      popMatrix();
      break;
    case 2: 
      stroke(displayColor, 128.0 * getFadeRatio());
      strokeWeight(strokeWeightValue * pow(getFadeRatio(), 4.0));
      line(xPosition, yPosition, xPosition + 800.0 * cos(rotationAngle), yPosition + 800.0 * sin(rotationAngle));
      strokeWeight(1.0);
      break;
    case 3: 
      final float ringSizeExpandRatio = 2.0 * (pow(getProgressRatio() - 1.0, 5.0) + 1.0);
      noFill();
      stroke(displayColor, 255.0 * getFadeRatio());
      strokeWeight(strokeWeightValue * getFadeRatio());
      ellipse(xPosition, yPosition, displaySize * (1.0 + ringSizeExpandRatio), displaySize * (1.0 + ringSizeExpandRatio));
      strokeWeight(1.0);
      break;
    default: 
      break;
    }
  }
}

final class GameSystem
{
  final ActorGroup myGroup, otherGroup;
  final ParticleSet commonParticleSet;
  GameSystemState currentState;
  float screenShakeValue;
  final DamagedPlayerActorState damagedState;
  final GameBackground currentBackground;
  final boolean demoPlay;
  boolean showsInstructionWindow;

  GameSystem(boolean demo, boolean instruction) {
   
    myGroup = new ActorGroup();
    otherGroup = new ActorGroup();
    myGroup.enemyGroup = otherGroup;
    otherGroup.enemyGroup = myGroup;


    final MovePlayerActorState moveState = new MovePlayerActorState();
    final DrawBowPlayerActorState drawShortbowState = new DrawShortbowPlayerActorState();
    final DrawBowPlayerActorState drawLongbowState = new DrawLongbowPlayerActorState();
    damagedState = new DamagedPlayerActorState();
    moveState.drawShortbowState = drawShortbowState;
    moveState.drawLongbowState = drawLongbowState;
    drawShortbowState.moveState = moveState;
    drawLongbowState.moveState = moveState;
    damagedState.moveState = moveState;

   
    PlayerEngine myEngine;
    if (demo) myEngine = new ComputerPlayerEngine();
    else myEngine = new HumanPlayerEngine(currentKeyInput);
    PlayerActor myPlayer = new PlayerActor(myEngine, color(255.0));
    myPlayer.xPosition = INTERNAL_CANVAS_SIDE_LENGTH * 0.5;
    myPlayer.yPosition = INTERNAL_CANVAS_SIDE_LENGTH - 100.0;
    myPlayer.state = moveState;
    myGroup.setPlayer(myPlayer);
    PlayerEngine otherEngine = new ComputerPlayerEngine();
    PlayerActor otherPlayer = new PlayerActor(otherEngine, color(0.0));
    otherPlayer.xPosition = INTERNAL_CANVAS_SIDE_LENGTH * 0.5;
    otherPlayer.yPosition = 100.0;
    otherPlayer.state = moveState;
    otherGroup.setPlayer(otherPlayer);


    commonParticleSet = new ParticleSet(2048);
    currentState = new StartGameState();
    currentBackground = new GameBackground(color(224.0), 0.1);
    demoPlay = demo;
    showsInstructionWindow = instruction;
  }
  GameSystem() {
    this(false, false);
  }

  void run() {
    if (demoPlay) {
      if (currentKeyInput.isZPressed) {
        system = new GameSystem();  
        return;
      }
    }
    
    pushMatrix();
    
    if (screenShakeValue > 0.0) {
      translate(random(-screenShakeValue, screenShakeValue), random(-screenShakeValue, screenShakeValue));
      screenShakeValue -= 50.0 / IDEAL_FRAME_RATE;
    }
    currentBackground.update();
    currentBackground.display();
    currentState.run(this);
    
    popMatrix();
    if (demoPlay && showsInstructionWindow) displayDemo();
  }
  
  void displayDemo() {
    pushStyle();

    stroke(0.0);
    strokeWeight(2.0);
    fill(255.0, 240.0);
    rect(
      INTERNAL_CANVAS_SIDE_LENGTH * 0.5,
      INTERNAL_CANVAS_SIDE_LENGTH * 0.5,
      INTERNAL_CANVAS_SIDE_LENGTH * 0.7,
      INTERNAL_CANVAS_SIDE_LENGTH * 0.6
    );

    textFont(smallFont, 20.0);
    textLeading(26.0);
    textAlign(RIGHT, BASELINE);
    fill(0.0);
    text("Z key:", 280.0, 180.0);
    text("X key:", 280.0, 250.0);
    text("Arrow key:", 280.0, 345.0);
    textAlign(LEFT);
    text("Weak shot\n (auto aiming)", 300.0, 180.0);
    text("Lethal shot\n (manual aiming,\n  requires charge)", 300.0, 250.0);
    text("Move\n (or aim lethal shot)", 300.0, 345.0);
    textAlign(CENTER);
    text("- Press Z key to start -", INTERNAL_CANVAS_SIDE_LENGTH * 0.5, 430.0);
    text("(Click to hide this window)", INTERNAL_CANVAS_SIDE_LENGTH * 0.5, 475.0);
    popStyle();
    
    strokeWeight(1.0);
  }

  void addSquareParticles(float x, float y, int particleCount, float particleSize, float minSpeed, float maxSpeed, float lifespanSecondValue) {
    final ParticleBuilder builder = system.commonParticleSet.builder
      .type(1)  
      .position(x, y)
      .particleSize(particleSize)
      .particleColor(color(0.0))
      .lifespanSecond(lifespanSecondValue)
      ;
    for (int i = 0; i < particleCount; i++) {
      final Particle newParticle = builder
        .polarVelocity(random(TWO_PI), random(minSpeed, maxSpeed))
        .build();
      system.commonParticleSet.particleList.add(newParticle);
    }
  }
}

final class GameBackground
{
  final ArrayList<BackgroundLine> lineList = new ArrayList<BackgroundLine>();
  final float maxAccelerationMagnitude;
  final color lineColor;

  GameBackground(color col, float maxAcc) {
    lineColor = col;
    maxAccelerationMagnitude = maxAcc;
    for (int i = 0; i < 10; i++) {
      lineList.add(new HorizontalLine());
    }
    for (int i = 0; i < 10; i++) {
      lineList.add(new VerticalLine());
    }
  }

  void update() {
    for (BackgroundLine eachLine : lineList) {
      eachLine.update(random(-maxAccelerationMagnitude, maxAccelerationMagnitude));
    }
  }
  void display() {
    stroke(lineColor);
    for (BackgroundLine eachLine : lineList) {
      eachLine.display();
    }
  }
}
abstract class BackgroundLine
{
  float position;
  float velocity;

  BackgroundLine(float initialPosition) {
    position = initialPosition;
  }
  void update(float acceleration) {
    position += velocity;
    velocity += acceleration;
    if (position < 0.0 || position > getMaxPosition()) velocity = -velocity;
  }
  abstract void display();
  abstract float getMaxPosition();
}
final class HorizontalLine
  extends BackgroundLine
{
  HorizontalLine() {
    super(random(INTERNAL_CANVAS_SIDE_LENGTH));
  }
  void display() {
    line(0.0, position, INTERNAL_CANVAS_SIDE_LENGTH, position);
  }
  float getMaxPosition() {
    return INTERNAL_CANVAS_SIDE_LENGTH;
  }
}
final class VerticalLine
  extends BackgroundLine
{
  VerticalLine() {
    super(random(INTERNAL_CANVAS_SIDE_LENGTH));
  }
  void display() {
    line(position, 0.0, position, INTERNAL_CANVAS_SIDE_LENGTH);
  }
  float getMaxPosition() {
    return INTERNAL_CANVAS_SIDE_LENGTH;
  }
}



abstract class GameSystemState
{
  int properFrameCount;

  void run(GameSystem system) {
    runSystem(system);

    translate(INTERNAL_CANVAS_SIDE_LENGTH * 0.5, INTERNAL_CANVAS_SIDE_LENGTH * 0.5);
    displayMessage(system);

    checkStateTransition(system);

    properFrameCount++;
  }
  abstract void runSystem(GameSystem system);
  abstract void displayMessage(GameSystem system);
  abstract void checkStateTransition(GameSystem system);
}

final class StartGameState
  extends GameSystemState
{
  final int frameCountPerNumber = int(IDEAL_FRAME_RATE);
  final float ringSize = 200.0;
  final color ringColor = color(0.0);
  final float ringStrokeWeight = 5.0;
  int displayNumber = 4;

  void runSystem(GameSystem system) {
    system.myGroup.update();
    system.otherGroup.update();
    system.myGroup.displayPlayer();
    system.otherGroup.displayPlayer();
  }

  void displayMessage(GameSystem system) {
    final int currentNumberFrameCount = properFrameCount % frameCountPerNumber;
    if (currentNumberFrameCount == 0) displayNumber--;
    if (displayNumber <= 0) return;

    fill(ringColor);
    text(displayNumber, 0.0, 0.0);

    rotate(-HALF_PI);
    strokeWeight(3.0);
    stroke(ringColor);
    noFill();
    arc(0.0, 0.0, ringSize, ringSize, 0.0, TWO_PI * float(properFrameCount % frameCountPerNumber) / frameCountPerNumber);
    strokeWeight(1.0);
  }

  void checkStateTransition(GameSystem system) {
    if (properFrameCount >= frameCountPerNumber * 3) {
      final Particle newParticle = system.commonParticleSet.builder
        .type(3)  
        .position(INTERNAL_CANVAS_SIDE_LENGTH * 0.5, INTERNAL_CANVAS_SIDE_LENGTH * 0.5)
        .polarVelocity(0.0, 0.0)
        .particleSize(ringSize)
        .particleColor(ringColor)
        .weight(ringStrokeWeight)
        .lifespanSecond(1.0)
        .build();
      system.commonParticleSet.particleList.add(newParticle);

      system.currentState = new PlayGameState();
    }
  }
}

final class PlayGameState
  extends GameSystemState
{
  int messageDurationFrameCount = int(IDEAL_FRAME_RATE);

  void runSystem(GameSystem system) {
    system.myGroup.update();
    system.myGroup.act();
    system.otherGroup.update();
    system.otherGroup.act();
    system.myGroup.displayPlayer();
    system.otherGroup.displayPlayer();
    system.myGroup.displayArrows();
    system.otherGroup.displayArrows();

    checkCollision();

    system.commonParticleSet.update();
    system.commonParticleSet.display();
  }

  void displayMessage(GameSystem system) {
    if (properFrameCount >= messageDurationFrameCount) return;
    fill(0.0, 255.0 * (1.0 - float(properFrameCount) / messageDurationFrameCount));
    text("Go", 0.0, 0.0);
  }

  void checkStateTransition(GameSystem system) {
    if (system.myGroup.player.isNull()) {
      system.currentState = new GameResultState("You lose.");
    } else if (system.otherGroup.player.isNull()) {
      system.currentState = new GameResultState("You win.");
    }
  }  

  void checkCollision() {
    final ActorGroup myGroup = system.myGroup;
    final ActorGroup otherGroup = system.otherGroup;

    for (AbstractArrowActor eachMyArrow : myGroup.arrowList) {
      for (AbstractArrowActor eachEnemyArrow : otherGroup.arrowList) {
        if (eachMyArrow.isCollided(eachEnemyArrow) == false) continue;
        breakArrow(eachMyArrow, myGroup);
        breakArrow(eachEnemyArrow, otherGroup);
      }
    }

    if (otherGroup.player.isNull() == false) {
      for (AbstractArrowActor eachMyArrow : myGroup.arrowList) {

        AbstractPlayerActor enemyPlayer = otherGroup.player;
        if (eachMyArrow.isCollided(enemyPlayer) == false) continue;

        if (eachMyArrow.isLethal()) killPlayer(otherGroup.player);
        else thrustPlayerActor(eachMyArrow, (PlayerActor)enemyPlayer);

        breakArrow(eachMyArrow, myGroup);
      }
    }

    if (myGroup.player.isNull() == false) {
      for ( AbstractArrowActor eachEnemyArrow : otherGroup.arrowList) {
        if (eachEnemyArrow.isCollided(myGroup.player) == false) continue;

        if (eachEnemyArrow.isLethal()) killPlayer(myGroup.player);
        else thrustPlayerActor(eachEnemyArrow, (PlayerActor)myGroup.player);

        breakArrow(eachEnemyArrow, otherGroup);
      }
    }
  }

  void killPlayer(AbstractPlayerActor player) {
    system.addSquareParticles(player.xPosition, player.yPosition, 50, 16.0, 2.0, 10.0, 4.0);
    player.group.player = new NullPlayerActor();
    system.screenShakeValue = 50.0;
  }

  void breakArrow(AbstractArrowActor arrow, ActorGroup group) {
    system.addSquareParticles(arrow.xPosition, arrow.yPosition, 10, 7.0, 1.0, 5.0, 1.0);
    group.removingArrowList.add(arrow);
  }

  void thrustPlayerActor(Actor referenceActor, PlayerActor targetPlayerActor) {
    final float relativeAngle = atan2(targetPlayerActor.yPosition - referenceActor.yPosition, targetPlayerActor.xPosition - referenceActor.xPosition);
    final float thrustAngle = relativeAngle + random(-0.5 * HALF_PI, 0.5 * HALF_PI);
    targetPlayerActor.xVelocity += 20.0 * cos(thrustAngle);
    targetPlayerActor.yVelocity += 20.0 * sin(thrustAngle);
    targetPlayerActor.state = system.damagedState.entryState(targetPlayerActor);
    system.screenShakeValue += 10.0;
  }
}

final class GameResultState
  extends GameSystemState
{
  final String resultMessage;
  final int durationFrameCount = int(IDEAL_FRAME_RATE);

  GameResultState(String msg) {
    resultMessage = msg;
  }

  void runSystem(GameSystem system) {
    system.myGroup.update();
    system.otherGroup.update();
    system.myGroup.displayPlayer();
    system.otherGroup.displayPlayer();

    system.commonParticleSet.update();
    system.commonParticleSet.display();
  }

  void displayMessage(GameSystem system) {
    if (system.demoPlay) return;

    fill(0.0);
    text(resultMessage, 0.0, 0.0);
    if (properFrameCount > durationFrameCount) {
      pushStyle();
      textFont(smallFont, 20.0);
      text("Press X key to reset.", 0.0, 80.0);
      popStyle();
    }
  }

  void checkStateTransition(GameSystem system) {
    if (system.demoPlay) {
      if (properFrameCount > durationFrameCount * 3) {
        newGame(true, system.showsInstructionWindow);
      }
    } else {
      if (properFrameCount > durationFrameCount && currentKeyInput.isXPressed) {
        newGame(true, true); 
      }
    }
  }
}


final class ActorGroup
{
  ActorGroup enemyGroup;

  AbstractPlayerActor player;
  final ArrayList<AbstractArrowActor> arrowList = new ArrayList<AbstractArrowActor>();
  final ArrayList<AbstractArrowActor> removingArrowList = new ArrayList<AbstractArrowActor>();

  void update() {
    player.update();

    if (removingArrowList.size() >= 1) {
      arrowList.removeAll(removingArrowList);
      removingArrowList.clear();
    }

    for (AbstractArrowActor eachArrow : arrowList) {
      eachArrow.update();
    }
  }
  void act() {
    player.act();
    for (AbstractArrowActor eachArrow : arrowList) {
      eachArrow.act();
    }
  }

  void setPlayer(PlayerActor newPlayer) {
    player = newPlayer;
    newPlayer.group = this;
  }
  void addArrow(AbstractArrowActor newArrow) {
    arrowList.add(newArrow);
    newArrow.group = this;
  }

  void displayPlayer() {
    player.display();
  }
  void displayArrows() {
    for (AbstractArrowActor eachArrow : arrowList) {
      eachArrow.display();
    }
  }
}

final class ParticleSet
{
  final ArrayList<Particle> particleList;
  final ArrayList<Particle> removingParticleList;
  final ObjectPool<Particle> particlePool;
  final ParticleBuilder builder;

  ParticleSet(int capacity) {
    particlePool = new ObjectPool<Particle>(capacity);
    for (int i = 0; i < capacity; i++) {
      particlePool.pool.add(new Particle());
    }

    particleList = new ArrayList<Particle>(capacity);
    removingParticleList = new ArrayList<Particle>(capacity);
    builder = new ParticleBuilder();
  }

  void update() {
    particlePool.update();

    for (Particle eachParticle : particleList) {
      eachParticle.update();
    }

    if (removingParticleList.size() >= 1) {
      for (Particle eachInstance : removingParticleList) {
        particlePool.deallocate(eachInstance);
      }
      particleList.removeAll(removingParticleList);
      removingParticleList.clear();
    }
  }

  void display() {
    for (Particle eachParticle : particleList) {
      eachParticle.display();
    }
  }

  Particle allocate() {
    return particlePool.allocate();
  }
}

final class ParticleBuilder {
  int particleTypeNumber;

  float xPosition, yPosition;
  float xVelocity, yVelocity;
  float directionAngle, speed;

  float rotationAngle;
  color displayColor;
  float strokeWeightValue;
  float displaySize;

  int lifespanFrameCount;

  ParticleBuilder initialize() {
    particleTypeNumber = 0;
    xPosition = 0.0;
    yPosition = 0.0;
    xVelocity = 0.0;
    yVelocity = 0.0;
    directionAngle = 0.0;
    speed = 0.0;
    rotationAngle = 0.0;
    displayColor = color(0.0);
    strokeWeightValue = 1.0;
    displaySize = 10.0;
    lifespanFrameCount = 60;
    return this;
  }
  ParticleBuilder type(int v) {
    particleTypeNumber = v;
    return this;
  }
  ParticleBuilder position(float x, float y) {
    xPosition = x;
    yPosition = y;
    return this;
  }
  ParticleBuilder polarVelocity(float dir, float spd) {
    directionAngle = dir;
    speed = spd;
    xVelocity = spd * cos(dir);
    yVelocity = spd * sin(dir);
    return this;
  }
  ParticleBuilder rotation(float v) {
    rotationAngle = v;
    return this;
  }
  ParticleBuilder particleColor(color c) {
    displayColor = c;
    return this;
  }
  ParticleBuilder weight(float v) {
    strokeWeightValue = v;
    return this;
  }
  ParticleBuilder particleSize(float v) {
    displaySize = v;
    return this;
  }
  ParticleBuilder lifespan(int v) {
    lifespanFrameCount = v;
    return this;
  }
  ParticleBuilder lifespanSecond(float v) {
    lifespan(int(v * IDEAL_FRAME_RATE));
    return this;
  }
  Particle build() {
    final Particle newParticle = system.commonParticleSet.allocate();
    newParticle.particleTypeNumber = this.particleTypeNumber;
    newParticle.xPosition = this.xPosition;
    newParticle.yPosition = this.yPosition;
    newParticle.xVelocity = this.xVelocity;
    newParticle.yVelocity = this.yVelocity;
    newParticle.directionAngle = this.directionAngle;
    newParticle.speed = this.speed;
    newParticle.rotationAngle = this.rotationAngle;
    newParticle.displayColor = this.displayColor;
    newParticle.strokeWeightValue = this.strokeWeightValue;
    newParticle.displaySize = this.displaySize;
    newParticle.lifespanFrameCount = this.lifespanFrameCount;
    return newParticle;
  }
}


void keyPressed() {
  if (key != CODED) {
    if (key == 'z' || key == 'Z') {
      currentKeyInput.isZPressed = true;
      return;
    }
    if (key == 'x' || key == 'X') {
      currentKeyInput.isXPressed = true;
      return;
    }
    if (key == 'p') {
      if (paused) loop();
      else noLoop();
      paused = !paused;
    }
    return;
  }
  switch(keyCode) {
  case UP:
    currentKeyInput.isUpPressed = true;
    return;
  case DOWN:
    currentKeyInput.isDownPressed = true;
    return;
  case LEFT:
    currentKeyInput.isLeftPressed = true;
    return;
  case RIGHT:
    currentKeyInput.isRightPressed = true;
    return;
  }
}

void keyReleased() {
  if (key != CODED) {
    if (key == 'z' || key == 'Z') {
      currentKeyInput.isZPressed = false;
      return;
    }
    if (key == 'x' || key == 'X') {
      currentKeyInput.isXPressed = false;
      return;
    }
    return;
  }
  switch(keyCode) {
  case UP:
    currentKeyInput.isUpPressed = false;
    return;
  case DOWN:
    currentKeyInput.isDownPressed = false;
    return;
  case LEFT:
    currentKeyInput.isLeftPressed = false;
    return;
  case RIGHT:
    currentKeyInput.isRightPressed = false;
    return;
  }
}



final class KeyInput {
  boolean isUpPressed = false;
  boolean isDownPressed = false;
  boolean isLeftPressed = false;
  boolean isRightPressed = false;
  boolean isZPressed = false;
  boolean isXPressed = false;
}




interface Poolable
{
  public boolean isAllocated();
  public void setAllocated(boolean indicator);
  public ObjectPool getBelongingPool();
  public void setBelongingPool(ObjectPool pool);
  public int getAllocationIdentifier(); 
  public void setAllocationIdentifier(int id);
  public void initialize();
}


final class ObjectPool<T extends Poolable>
{
  final int poolSize;
  final ArrayList<T> pool;  
  int index = 0;
  final ArrayList<T> temporalInstanceList;
  int temporalInstanceCount = 0;
  int allocationCount = 0;
    
  ObjectPool(int pSize) {
    poolSize = pSize;
    pool = new ArrayList<T>(pSize);
    temporalInstanceList = new ArrayList<T>(pSize);
  }
  
  ObjectPool() {
    this(256);
  }

  T allocate() {
    if (isAllocatable() == false) {
      println("Object pool allocation failed. Too many objects created!");
     
      return null;
    }
    T allocatedInstance = pool.get(index);
    
    allocatedInstance.setAllocated(true);
    allocatedInstance.setAllocationIdentifier(allocationCount);
    index++;
    allocationCount++;

    return allocatedInstance;
  }
  
  T allocateTemporal() {
    T allocatedInstance = allocate();
    setTemporal(allocatedInstance);
    return allocatedInstance;
  }
  
  void storeObject(T obj) {
    if (pool.size() >= poolSize) {
      println("Failed to store a new instance to object pool. Object pool is already full.");
  
    }
    pool.add(obj);
    obj.setBelongingPool(this);
    obj.setAllocationIdentifier(-1);
    obj.setAllocated(false);
  }
  
  boolean isAllocatable() {
    return index < poolSize;
  }
  
  void deallocate(T killedObject) {
    if (!killedObject.isAllocated()) {
      return;
    }

    killedObject.initialize();
    killedObject.setAllocated(false);
    killedObject.setAllocationIdentifier(-1);
    index--;
    pool.set(index, killedObject);
  }
  
  void update() {
    while(temporalInstanceCount > 0) {
      temporalInstanceCount--;
      deallocate(temporalInstanceList.get(temporalInstanceCount));
    }
    temporalInstanceList.clear();    
  }
  
  void setTemporal(T obj) {
    temporalInstanceList.add(obj);   
    temporalInstanceCount++;
  }
}


abstract class PlayerActorState
{
  abstract void act(PlayerActor parentActor);
  abstract void displayEffect(PlayerActor parentActor);
  abstract PlayerActorState entryState(PlayerActor parentActor);

  float getEnemyPlayerActorAngle(PlayerActor parentActor) {
    final AbstractPlayerActor enemyPlayer = parentActor.group.enemyGroup.player;
    return atan2(enemyPlayer.yPosition - parentActor.yPosition, enemyPlayer.xPosition - parentActor.xPosition);
  }
  boolean isDamaged() {
    return false;
  }
  boolean isDrawingLongBow() {
    return false;
  }
  boolean hasCompletedLongBowCharge(PlayerActor parentActor) {
    return false;
  }
}

final class DamagedPlayerActorState
  extends PlayerActorState
{
  PlayerActorState moveState;
  final int durationFrameCount = int(0.75 * IDEAL_FRAME_RATE);

  void act(PlayerActor parentActor) {
    parentActor.damageRemainingFrameCount--;
    if (parentActor.damageRemainingFrameCount <= 0) parentActor.state = moveState.entryState(parentActor);
  }
  void displayEffect(PlayerActor parentActor) {
    noFill();
    stroke(192.0, 64.0, 64.0, 255.0 * float(parentActor.damageRemainingFrameCount) / durationFrameCount);
    ellipse(0.0, 0.0, 64.0, 64.0);
  }
  PlayerActorState entryState(PlayerActor parentActor) {
    parentActor.damageRemainingFrameCount = durationFrameCount;
    return this;
  }
  boolean isDamaged() {
    return true;
  }
}

final class MovePlayerActorState
  extends PlayerActorState
{
  PlayerActorState drawShortbowState, drawLongbowState;

  void act(PlayerActor parentActor) {
    final AbstractInputDevice input = parentActor.engine.controllingInputDevice;
    parentActor.addVelocity(1.0 * input.horizontalMoveButton, 1.0 * input.verticalMoveButton);

    if (input.shotButtonPressed) {
      parentActor.state = drawShortbowState.entryState(parentActor);
      parentActor.aimAngle = getEnemyPlayerActorAngle(parentActor);
      return;
    }
    if (input.longShotButtonPressed) {
      parentActor.state = drawLongbowState.entryState(parentActor);
      parentActor.aimAngle = getEnemyPlayerActorAngle(parentActor);
      return;
    }
  }
  void displayEffect(PlayerActor parentActor) {
  }
  PlayerActorState entryState(PlayerActor parentActor) {
    return this;
  }
}

abstract class DrawBowPlayerActorState
  extends PlayerActorState
{
  PlayerActorState moveState;

  void act(PlayerActor parentActor) {
    final AbstractInputDevice input = parentActor.engine.controllingInputDevice;
    aim(parentActor, input);

    parentActor.addVelocity(0.25 * input.horizontalMoveButton, 0.25 * input.verticalMoveButton);

    if (triggerPulled(parentActor)) fire(parentActor);

    if (buttonPressed(input) == false) {
      parentActor.state = moveState.entryState(parentActor);
    }
  }

  abstract void aim(PlayerActor parentActor, AbstractInputDevice input);
  abstract void fire(PlayerActor parentActor);
  abstract boolean buttonPressed(AbstractInputDevice input);
  abstract boolean triggerPulled(PlayerActor parentActor);
}

final class DrawShortbowPlayerActorState
  extends DrawBowPlayerActorState
{
  final int fireIntervalFrameCount = int(IDEAL_FRAME_RATE * 0.2);

  void aim(PlayerActor parentActor, AbstractInputDevice input) {
    parentActor.aimAngle = getEnemyPlayerActorAngle(parentActor);
  }

  void fire(PlayerActor parentActor) {
    ShortbowArrow newArrow = new ShortbowArrow();
    final float directionAngle = parentActor.aimAngle;
    newArrow.xPosition = parentActor.xPosition + 24.0 * cos(directionAngle);
    newArrow.yPosition = parentActor.yPosition + 24.0 * sin(directionAngle);
    newArrow.rotationAngle = directionAngle;
    newArrow.setVelocity(directionAngle, 24.0);

    parentActor.group.addArrow(newArrow);
  }

  void displayEffect(PlayerActor parentActor) {
    line(0.0, 0.0, 70.0 * cos(parentActor.aimAngle), 70.0 * sin(parentActor.aimAngle));
    noFill();
    arc(0.0, 0.0, 100.0, 100.0, parentActor.aimAngle - QUARTER_PI, parentActor.aimAngle + QUARTER_PI);
  }
  PlayerActorState entryState(PlayerActor parentActor) {
    return this;
  }

  boolean buttonPressed(AbstractInputDevice input) {
    return input.shotButtonPressed;
  }
  boolean triggerPulled(PlayerActor parentActor) {
    return frameCount % fireIntervalFrameCount == 0;
  }
}

final class DrawLongbowPlayerActorState
  extends DrawBowPlayerActorState
{
  final float unitAngleSpeed = 0.1 * TWO_PI / IDEAL_FRAME_RATE;
  final int chargeRequiredFrameCount = int(0.5 * IDEAL_FRAME_RATE);
  final color effectColor = color(192.0, 64.0, 64.0);
  final float ringSize = 80.0;
  final float ringStrokeWeight = 5.0;

  PlayerActorState entryState(PlayerActor parentActor) {
    parentActor.chargedFrameCount = 0;
    return this;
  }

  void aim(PlayerActor parentActor, AbstractInputDevice input) {
    parentActor.aimAngle += input.horizontalMoveButton * unitAngleSpeed;
  }

  void fire(PlayerActor parentActor) {
    final float arrowComponentInterval = 24.0;
    final int arrowShaftNumber = 5;
    for (int i = 0; i < arrowShaftNumber; i++) {
      LongbowArrowShaft newArrow = new LongbowArrowShaft();
      newArrow.xPosition = parentActor.xPosition + i * arrowComponentInterval * cos(parentActor.aimAngle);
      newArrow.yPosition = parentActor.yPosition + i * arrowComponentInterval * sin(parentActor.aimAngle);
      newArrow.rotationAngle = parentActor.aimAngle;
      newArrow.setVelocity(parentActor.aimAngle, 64.0);

      parentActor.group.addArrow(newArrow);
    }

    LongbowArrowHead newArrow = new LongbowArrowHead();
    newArrow.xPosition = parentActor.xPosition + arrowShaftNumber * arrowComponentInterval * cos(parentActor.aimAngle);
    newArrow.yPosition = parentActor.yPosition + arrowShaftNumber * arrowComponentInterval * sin(parentActor.aimAngle);
    newArrow.rotationAngle = parentActor.aimAngle;
    newArrow.setVelocity(parentActor.aimAngle, 64.0);

    final Particle newParticle = system.commonParticleSet.builder
      .type(2) 
      .position(parentActor.xPosition, parentActor.yPosition)
      .polarVelocity(0.0, 0.0)
      .rotation(parentActor.aimAngle)
      .particleColor(color(192.0, 64.0, 64.0))
      .lifespanSecond(2.0)
      .weight(16.0)
      .build();    
    system.commonParticleSet.particleList.add(newParticle);

    parentActor.group.addArrow(newArrow);

    system.screenShakeValue += 10.0;
    
    parentActor.chargedFrameCount = 0;
    parentActor.state = moveState.entryState(parentActor);
  }

  void displayEffect(PlayerActor parentActor) {
    noFill();
    stroke(0.0);
    arc(0.0, 0.0, 100.0, 100.0, parentActor.aimAngle - QUARTER_PI, parentActor.aimAngle + QUARTER_PI);

    if (hasCompletedLongBowCharge(parentActor)) stroke(effectColor);
    else stroke(0.0, 128.0);

    line(0.0, 0.0, 800.0 * cos(parentActor.aimAngle), 800.0 * sin(parentActor.aimAngle));

    rotate(-HALF_PI);
    strokeWeight(ringStrokeWeight);
    arc(0.0, 0.0, ringSize, ringSize, 0.0, TWO_PI * min(1.0, float(parentActor.chargedFrameCount) / chargeRequiredFrameCount));
    strokeWeight(1.0);
    rotate(+HALF_PI);

    parentActor.chargedFrameCount++;
  }

  void act(PlayerActor parentActor) {
    super.act(parentActor);

    if (parentActor.chargedFrameCount != chargeRequiredFrameCount) return;

    final Particle newParticle = system.commonParticleSet.builder
      .type(3)  
      .position(parentActor.xPosition, parentActor.yPosition)
      .polarVelocity(0.0, 0.0)
      .particleSize(ringSize)
      .particleColor(effectColor)
      .weight(ringStrokeWeight)
      .lifespanSecond(0.5)
      .build();    
    system.commonParticleSet.particleList.add(newParticle);
  }

  boolean isDrawingLongBow() {
    return true;
  }
  boolean hasCompletedLongBowCharge(PlayerActor parentActor) {
    return parentActor.chargedFrameCount >= chargeRequiredFrameCount;
  }

  boolean buttonPressed(AbstractInputDevice input) {
    return input.longShotButtonPressed;
  }
  boolean triggerPulled(PlayerActor parentActor) {
    return buttonPressed(parentActor.engine.controllingInputDevice) == false && hasCompletedLongBowCharge(parentActor);
  }
}

abstract class AbstractInputDevice
{
  int horizontalMoveButton, verticalMoveButton;
  boolean shotButtonPressed, longShotButtonPressed;

  void operateMoveButton(int horizontal, int vertical) {
    horizontalMoveButton = horizontal;
    verticalMoveButton = vertical;
  }
  void operateShotButton(boolean pressed) {
    shotButtonPressed = pressed;
  }
  void operateLongShotButton(boolean pressed) {
    longShotButtonPressed = pressed;
  }
}

final class InputDevice
  extends AbstractInputDevice
{
}

final class ShotDisabledInputDevice
  extends AbstractInputDevice
{
  void operateShotButton(boolean pressed) {
  }
  void operateLongShotButton(boolean pressed) {
  }
}

final class DisabledInputDevice
  extends AbstractInputDevice
{
  void operateMoveButton(int horizontal, int vertical) {
  }
  void operateShotButton(boolean pressed) {
  }
  void operateLongShotButton(boolean pressed) {
  }
}



abstract class PlayerEngine
{
  final AbstractInputDevice controllingInputDevice;

  PlayerEngine() {
    controllingInputDevice = new InputDevice();
  }

  abstract void run(PlayerActor player);
}

final class HumanPlayerEngine
  extends PlayerEngine
{
  final KeyInput currentKeyInput;

  HumanPlayerEngine(KeyInput _keyInput) {
    currentKeyInput = _keyInput;
  }

  void run(PlayerActor player) {
    final int intUp = currentKeyInput.isUpPressed ? -1 : 0;
    final int intDown = currentKeyInput.isDownPressed ? 1 : 0;
    final int intLeft = currentKeyInput.isLeftPressed ? -1 : 0;
    final int intRight = currentKeyInput.isRightPressed ? 1 : 0;  

    controllingInputDevice.operateMoveButton(intLeft + intRight, intUp + intDown);
    controllingInputDevice.operateShotButton(currentKeyInput.isZPressed);
    controllingInputDevice.operateLongShotButton(currentKeyInput.isXPressed);
  }
}

final class ComputerPlayerEngine
  extends PlayerEngine
{
  final int planUpdateFrameCount = 10;
  PlayerPlan currentPlan;

  ComputerPlayerEngine() {
 
    final MovePlayerPlan move = new MovePlayerPlan();
    final JabPlayerPlan jab = new JabPlayerPlan();
    final KillPlayerPlan kill = new KillPlayerPlan();
    move.movePlan = move;
    move.jabPlan = jab;
    move.killPlan = kill;
    jab.movePlan = move;
    jab.jabPlan = jab;
    jab.killPlan = kill;
    kill.movePlan = move;

    currentPlan = move;
  }

  void run(PlayerActor player) {
    currentPlan.execute(player, controllingInputDevice);

    if (frameCount % planUpdateFrameCount == 0) currentPlan = currentPlan.nextPlan(player);
  }
}

abstract class PlayerPlan
{
  abstract void execute(PlayerActor player, AbstractInputDevice input);
  abstract PlayerPlan nextPlan(PlayerActor player);
}

abstract class DefaultPlayerPlan
  extends PlayerPlan
{
  PlayerPlan movePlan, jabPlan, escapePlan, killPlan;
  int horizontalMove, verticalMove;
  boolean shoot;

  void execute(PlayerActor player, AbstractInputDevice input) {
    input.operateMoveButton(horizontalMove, verticalMove);
    input.operateLongShotButton(false);
  }

  PlayerPlan nextPlan(PlayerActor player) {
    final AbstractPlayerActor enemy = player.group.enemyGroup.player;

    
    if (enemy.state.isDamaged()) {
      if (random(1.0) < 0.3) return killPlan;
    }
    

    AbstractArrowActor nearestArrow = null;
    float tmpMinDistancePow2 = 999999999.0;
    for (AbstractArrowActor eachArrow : enemy.group.arrowList) {
      final float distancePow2 = player.getDistancePow2(eachArrow);
      if (distancePow2 < tmpMinDistancePow2) {
        nearestArrow = eachArrow;
        tmpMinDistancePow2 = distancePow2;
      }
    }
    if (tmpMinDistancePow2 < 40000.0) {
      final float playerAngleInArrowFrame = nearestArrow.getAngle(player);
      float escapeAngle = nearestArrow.directionAngle;
      if (playerAngleInArrowFrame - nearestArrow.directionAngle > 0.0) escapeAngle += QUARTER_PI + random(QUARTER_PI);
      else escapeAngle -= QUARTER_PI + random(QUARTER_PI);
      final float escapeTargetX = player.xPosition + 100.0 * cos(escapeAngle);
      final float escapeTargetY = player.yPosition + 100.0 * sin(escapeAngle);
      setMoveDirection(player, escapeTargetX, escapeTargetY, 0.0);
      if (random(1.0) < 0.7) return movePlan;
      else return jabPlan;
    }

    setMoveDirection(player, enemy);
    if (player.getDistancePow2(enemy) < 100000.0) {
      if (random(1.0) < 0.7) return movePlan;
      else return jabPlan;
    }


    if (random(1.0) < 0.2) return movePlan;
    else return jabPlan;
  }
  
  void setMoveDirection(PlayerActor player, AbstractPlayerActor enemy) {
    float targetX, targetY;
    if (enemy.xPosition > INTERNAL_CANVAS_SIDE_LENGTH * 0.5) targetX = random(0.0, INTERNAL_CANVAS_SIDE_LENGTH * 0.5);
    else targetX = random(INTERNAL_CANVAS_SIDE_LENGTH * 0.5, INTERNAL_CANVAS_SIDE_LENGTH);
    if (enemy.yPosition > INTERNAL_CANVAS_SIDE_LENGTH * 0.5) targetY = random(0.0, INTERNAL_CANVAS_SIDE_LENGTH * 0.5);
    else targetY = random(INTERNAL_CANVAS_SIDE_LENGTH * 0.5, INTERNAL_CANVAS_SIDE_LENGTH);
    setMoveDirection(player, targetX, targetY, 100.0);
  }
  void setMoveDirection(PlayerActor player, float targetX, float targetY, float allowance) {
    if (targetX > player.xPosition + allowance) horizontalMove = 1;
    else if (targetX < player.xPosition - allowance) horizontalMove = -1;
    else horizontalMove = 0;

    if (targetY > player.yPosition + allowance) verticalMove = 1;
    else if (targetY < player.yPosition - allowance) verticalMove = -1;
    else verticalMove = 0;
  }
}

final class MovePlayerPlan
  extends DefaultPlayerPlan
{
  void execute(PlayerActor player, AbstractInputDevice input) {
    super.execute(player, input);
    input.operateShotButton(false);
  }
}

final class JabPlayerPlan
  extends DefaultPlayerPlan
{
  void execute(PlayerActor player, AbstractInputDevice input) {
    super.execute(player, input);
    input.operateShotButton(true);
  }
}

final class KillPlayerPlan
  extends PlayerPlan
{
  PlayerPlan movePlan, escapePlan;

  void execute(PlayerActor player, AbstractInputDevice input) {
    int horizontalMove;
    final float relativeAngle = player.getAngle(player.group.enemyGroup.player) - player.aimAngle;
    if (abs(relativeAngle) < radians(1.0)) horizontalMove = 0;
    else {
      if ((relativeAngle + TWO_PI) % TWO_PI > PI) horizontalMove = -1;
      else horizontalMove = +1;
    }
    input.operateMoveButton(horizontalMove, 0);

    input.operateShotButton(false);

    if (player.state.hasCompletedLongBowCharge(player) && random(1.0) < 0.05) input.operateLongShotButton(false);
    else input.operateLongShotButton(true);
  }

  PlayerPlan nextPlan(PlayerActor player) {
    final AbstractPlayerActor enemy = player.group.enemyGroup.player;

    if (abs(player.getAngle(player.group.enemyGroup.player) - player.aimAngle) > QUARTER_PI) return movePlan;
    if (player.getDistance(enemy) < 400.0) return movePlan;
    if (player.engine.controllingInputDevice.longShotButtonPressed == false) return movePlan;

    return this;
  }
}