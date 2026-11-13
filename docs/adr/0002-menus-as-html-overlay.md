# Menus as an HTML overlay

Screens other than the match (main menu, credits, later settings) are HTML elements laid over the canvas and sized to its rect, not `FrameItem`s drawn on the canvas. While they show, the canvas renders only the backdrop and attract mode. Native buttons and links come with focus, keyboard, mouse, touch and accessibility support, which the canvas would otherwise need hit-testing and a focus model for. The cost is two rendering paths: the canvas pipeline stays for the match, and menu styling lives in CSS.

Attract mode is dimmed so the menu stays readable. It plays behind the main menu and the settings (where it reflects display settings live), stays paused behind the credits, and is discarded when a match starts.
