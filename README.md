MagicHome UFO LED Controller Node

Allows basic control of LED light controllers, usually known as MagicHome, Zengge, LEDENET or Sunix (amonst other names).

Accepts a payload of a single boolean 'on' value to set the state of the light. Outputs in the same format when a change to the light state is detected.

## CHANGE LOG

##### 1.2.0 03-MAY-2018 (@joocer)
- BUXFIX: state continued to refresh after the node was removed
- updated information text
- Added brightness setting to input, output and status

##### 1.1.0 01-MAY-2018 (@joocer)
- updated status message text
- status messages based on feedback from light rather than predicted state
- light status rechecked every 5 seconds to reflect latest state
- updated information text 