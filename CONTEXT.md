# Slingshot

A two-player, turn-based artillery game in which missiles are bent by the gravity of planets on their way to the opposing ship.

## Language

### Navigation

**Screen**:
What the game currently shows: the main menu, the credits, or a match.
_Avoid_: Scene, state, page

**Main menu**:
The screen the game opens on; offers Play and Credits.
_Avoid_: Title screen, start screen

**Credits**:
The screen naming the original game's authors, the asset sources, and the licences.

**Attract mode**:
A demo round that plays itself behind the main menu, firing shots automatically; it never scores and never becomes a match.
_Avoid_: Demo, idle mode, screensaver

### Match structure

**Match**:
A series of rounds between two players, started from the main menu and played until abandoned.
_Avoid_: Game, session

**Round**:
One planet layout and ship placement, played until a ship is hit.
_Avoid_: Level, game

**Shot**:
One firing by a player, from launch until the missile hits a planet or ship, leaves the tracking area, or leaves the playing area after timing out.
_Avoid_: Turn, attempt

**Timeout**:
The point after a fixed flight duration from which a missile no longer returns from outside the playing area.

**Attempt**:
The count of shots a player has fired in the current round; earlier hits earn a quick-hit bonus.

**Aim**:
The angle and power a player has set on their ship for the next shot.
_Avoid_: Targeting

**Hot-seat**:
Both players share one device and take shots in alternation.
_Avoid_: Local multiplayer

### Scoring

**Hit**:
A missile striking the opposing ship; ends the round and scores for the shooter.
_Avoid_: Kill

**Self-hit**:
A missile striking the shooter's own ship; ends the round and deducts from the shooter.
_Avoid_: Suicide

**Quick-hit bonus**:
Extra score for a hit on the first, second, or third attempt of a round.

**Power penalty**:
A deduction proportional to the power of the hitting shot, rewarding gentle shots.

### Space

**Playing area**:
The visible rectangle of space containing ships and planets.
_Avoid_: Screen, board

**Tracking area**:
A larger rectangle around the playing area within which a missile stays in flight even when not visible.
_Avoid_: Range

**Zoom view**:
A shrunken overview of the tracking area, shown while the missile is outside the playing area.
_Avoid_: Minimap

### Bodies

**Ship**:
A player's vessel at the left or right edge of the playing area; the target of shots.
_Avoid_: Player (when meaning the vessel), tank

**Planet**:
A body whose gravity bends the missile and which destroys it on contact.

**Gravity-well contour**:
A set of faint rings drawn around a planet, spaced by the planet's mass, showing how strongly it pulls.
_Avoid_: Gravity field, aura, halo

**Missile**:
The projectile of a shot, moved only by its launch velocity and planetary gravity.
_Avoid_: Bullet, shell, particle
