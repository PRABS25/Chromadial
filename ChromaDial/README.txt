CHROMADIAL FOR WINDOWS
=====================

Start the game
--------------
1. Keep this complete folder together.
2. Double-click "Launch ChromaDial.cmd".
3. Microsoft Edge opens it in a clean, standalone app window.

Optional: double-click "Install Desktop Shortcut.cmd" once to place a
ChromaDial shortcut with its own icon on the Windows desktop. The game remains
portable, so keep its extracted folder after creating the shortcut.

No installation and no internet connection are required. If Edge cannot be
found, the launcher opens the game in your default browser instead.

Game modes
----------
MATCH TARGET
A target colour is provided. Turn the dials until your mixed colour resembles
the target, then select Check match. A score of 97 or above solves the target.
The comparison uses CIE Lab Delta E 2000, a perceptual colour-difference method.
A checked score of exactly 100 launches the fireworks celebration.

SOUNDS
Select Check match to hear a short sound for your result:
- Below 97: two soft, descending wooden notes.
- 97 or above: a sparkling three-note bell chime.
Use Sound on / Sound off at the top right to mute or enable sounds.
The game remembers your choice when browser storage is available.
Sounds are generated locally and work offline without extra audio files.

EDITING THE SOUNDS
Open js/sound-effects.js in Notepad and find SOUND_SETTINGS near the top.
- volume changes the overall loudness (0 is silent; 1 is full volume).
- correct contains the success chime; incorrect contains the try-again sound.
- In notes, frequency changes pitch, at changes the start time, and duration
  changes how long the note lasts. Times are in seconds.
Save the file, then close and reopen ChromaDial to hear your changes.
If updating an existing game, replacing just js/sound-effects.js keeps any
custom score threshold you already edited in js/app.js.

FREE MIX
Turn the dials freely. ChromaDial reports the closest recognised colour name,
the exact channel values, and the hexadecimal colour value.

Colour systems
--------------
RGB: Red, Green, and Blue, each from 0 to 255.
CMYK: Cyan, Magenta, Yellow, and Black, each from 0 to 100 percent.

CMYK is simulated on an RGB display. Actual ink and pigment mixtures depend on
materials, illumination, paper, and print profiles, so their appearance can
differ from this educational simulation.

Controlling a dial
------------------
- Drag upward or downward with the mouse.
- Place the pointer over a dial and use the mouse wheel.
- Focus a dial and use the arrow keys.
- Hold Shift with the mouse wheel or arrow keys for larger changes.
- Home sets a dial to zero. End sets it to its maximum.

Files
-----
index.html             Application screen
styles.css             Visual design
js/color-engine.js     Colour conversion, naming, and perceptual comparison
js/sound-effects.js    Offline result sounds and saved sound preference
js/app.js              Game rules and controls
assets/icon.svg        Application icon
assets/ChromaDial.ico  Windows shortcut icon
Launch ChromaDial.cmd  Windows launcher
Install Desktop Shortcut.cmd  Optional desktop shortcut creator

Privacy
-------
The game is fully local. It sends no data anywhere. Statistics are stored only
in the browser profile on the same computer, along with the sound preference.
