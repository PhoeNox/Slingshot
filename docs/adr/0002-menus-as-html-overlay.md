# Menus as an HTML overlay

Screens other than the match (main menu, credits, later settings) are HTML elements laid over the canvas and sized to its rect, not `FrameItem`s drawn on the canvas. While they show, the canvas renders only the backdrop. Native buttons and links come with focus, keyboard, mouse, touch and accessibility support, which the canvas would otherwise need hit-testing and a focus model for. The cost is two rendering paths: the canvas pipeline stays for the match, and menu styling lives in CSS.
