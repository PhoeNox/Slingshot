# Slingshot

A two-player, turn-based artillery game in which missiles are bent by the gravity of planets on their way to the opposing ship.

## Language

### Navigation

**Screen**:
What the game currently shows: the main menu, the play menu, the settings, the credits, the host or guest screen, or a match.
_Avoid_: Scene, state, page

**Main menu**:
The screen the game opens on; offers Play, Settings and Credits.
_Avoid_: Title screen, start screen

**Play menu**:
The screen, reached from Play on the main menu, offering a hot-seat match or hosting a remote match; a guest never passes through it and arrives by invitation instead.
_Avoid_: Mode select, lobby

**Settings**:
The screen, reached from the main menu, where players choose how future matches are played and how the game is drawn; choices are remembered between visits.
_Avoid_: Options, preferences, config

**Credits**:
The screen naming the original game's authors, the asset sources, and the licences.

**Attract mode**:
A demo round that plays itself behind the main menu, firing shots automatically; it never scores and never becomes a match.
_Avoid_: Demo, idle mode, screensaver

### Match structure

**Match**:
A series of rounds between two players, started from the main menu and played until abandoned.
_Avoid_: Game, session

**Match rules**:
The settings that shape play (planet count range, timeout, bounce, planet visibility), fixed when a match starts and unchanged for its whole life; attract mode always uses the default match rules.
_Avoid_: Game options, config

**Round**:
One planet layout and ship placement, played until a ship is hit.
_Avoid_: Level, game

**Shot**:
One firing by a player, from launch until the missile hits a planet or ship, leaves the tracking area, leaves the playing area after timing out, or times out under bounce.
_Avoid_: Turn, attempt

**Timeout**:
The point after a flight duration set by the match rules from which a missile no longer returns from outside the playing area, or, under bounce, at which the shot ends; the match rules may also disable it.

**Bounce**:
A match rule under which the missile reflects off every edge of the playing area instead of leaving it.
_Avoid_: Walls, rebound

**Planet visibility**:
A match rule for when planets and their gravity-well contours are shown during a round: always, only briefly at round start, or hidden; in both latter cases they are revealed when the round ends.
_Avoid_: Invisible planets, fog

**Attempt**:
The count of shots a player has fired in the current round; earlier hits earn a quick-hit bonus.

**Aim**:
The angle and power a player has set on their ship for the next shot.
_Avoid_: Targeting

**Hot-seat**:
Both players share one device and take shots in alternation.
_Avoid_: Local multiplayer

**Remote match**:
A match whose two players are on different devices, joined by invitation, exchanging shots instead of sharing one device.
_Avoid_: Online multiplayer, netplay

**Host**:
The player who starts a remote match, sends the invitation, and whose match rules it is played under; flies the left ship.
_Avoid_: Server, owner

**Guest**:
The player who joins a remote match by invitation; flies the right ship.
_Avoid_: Client

**Invitation**:
The link a host sends to let a guest join a remote match.
_Avoid_: Invite code, room

**Reply code**:
The text a guest sends back to the host to complete joining a remote match by hand, needed only when opening the invitation does not join on its own.
_Avoid_: Answer, token

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

**Zoom**:
How far the view is shrunk and where it sits so the playing area and the missile are both in sight: none while the missile is inside, just enough while it is outside, leaning toward the missile's side instead of showing empty space beyond the far edge, easing back as it returns.
_Avoid_: Zoom view, minimap, camera

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
