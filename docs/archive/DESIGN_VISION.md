# AudioFlam Design Vision - Historical Specification

**Status:** ✅ Mostly Implemented (January 2026)

---

## Archive Note

This document contains the original design vision for AudioFlam from January 2026, including UI mockups, layout specifications, component descriptions, and icon requirements.

**Most features have been implemented.** For current design system, see:
- AGENTS.md "Design System" section (colors, typography, spacing)
- `src/app.css` (CSS variables for all design tokens)
- `static/icons/` (current icon set)

Used as historical reference if understanding original design decisions is needed.

---

## Original Design Vision

## Implementation of audiogram function for AudioFlam - UI design vision

Note: visuals are located in the info folder. Icons are added to static/icons

**Introduction**
- AudioFlam will now have two pages: TTS and Audiogram.
- In the header, the AudiFlam logo should be reduced SLIGHTLY in size and aligned LEFT, while the TTS button (active by default), and audiogram page button are aligned right.
- The buttons should be in the style of another in the ‘flam’ app series, PromptFlam, with the icon inside a circle (both #777777) when not active, and reversed white out of solid brand purple #5422b0. See screenshot promptflam.png in info folder to see how the icons appear in a sister ‘flam’ app.
- Icons for header: icon-tts.svg (for default TTS page), icon-audiogram.svg (for audiogram page)
- Visuals. Default view of audiogram page: audiogram-home.png

**Audiogram page initial view**
- From the top, the components of the audiogram page are …
	- Image import box with dotted border - allows import of image from device by tapping or (on desktop) by drag and drop. Includes upload icon: icon-upload.svg
	- Audio import box with dotted border - - allows import of image from device by tapping or (on desktop) by drag and drop. Includes upload icon: icon-upload.svg
	- Play/record control row. From left [start again] … [back 5 seconds][play/stop button][forward 5 seconds] … [microphone]
		- The ‘start again’ button (icon-start-again.svg) is disabled by default (until audio is uploaded/recorded), then becomes active. The style and behaviour of the play/stop button and forward/back buttons are exactly as in the TTS page
	- Waveform toggle panel
	- Title toggle panel
	- Light effect toggle panel
	- Download audiogram to MP4 button
- Note: Toggle panels open automatically when the toggle is tapped. They can then be opened and closed using the expand/collapse chevrons (icon-expand.svg, icon-collapse.svg). When any other dropdown panel is tapped, any previous open panel should close automatically.

Icons: Icon-upload.svg, icon-start-again.svg, icon-back-five.svg, icon-forward-five.svg, icon-play-fill.svg, icon-mic.svg, icon-expand.svg, icon-collapse.svg
Visuals. Default view of audiogram page: audiogram-home.png

## Audiogram page components and functions

**Image**

- When an image is uploaded, the dotted border image upload panel is replace by a full width and depth image. The image can be imported at any size (but should be resized to max width 1080p for vertical/square images and 1920p for horizontal images. See image.png
- Two text buttons appear under the image: 
	- Replace image (aligned left - brings up the gallery to select another image, which replaces the current image)
	- Resize (aligned right - brings up a size/crop drawer)
- Tapping the Resize button brings up a full screen drawer from the bottom. At the top right is a text button ‘Done’ to close the drawer. 
- The drawer displays the image at the top (at imported ratio) with four buttons aligned left under the image: [None][9:16][1:1][16:9] ‘None’ (ie no crop) is selected by default. 
- When, for example, the vertical button (with icon and text 9:16) is tapped, the image displays a 9:16 window with translucent bars indicating the area that will be cropped. The user can use two finger pinch to expand/contract the image and single finger to reposition.

Icons. icon-none.svg, icon-vertical.svg, icon-square.svg, icon-horizontal.svg
Visuals. resize.svg

**Import Audio**

- When the import audio panel (dotted border + icon-upload.svg) is tapped and audio selected on the device (or optionally dragged to the dotted border panel on desktop), audio is imported and the audio import panel is REPLACED by:
	- a fine solid line panel  
	- a static waveform of the audio, with handles to left and right. 
- A modest timestamp is added below the waveform panel, aligned left, with the audio duration.
- The audio can be trimmed using the handles, with a light grey box indicating the full width/height of the audio panel to left and right.
- When the audio has imported, the Play button becomes active (exactly as the TTS page behaviour) and the audio can be played, paused or moved forward/back 5 seconds using the skip forward/back buttons.
- The audio can be replaced by tapping the ‘Start again’ button to the left (icon-start-again.svg)

Icons. icon-start-again.svg, icon-back-five.svg, icon-forward-five.svg, icon-play-fill-svg, icon-pause-fill.svg
Visuals. import-audio.png

**audio-record**

- When the microphone button is tapped, it becomes active (grey #777777 icon-mic.svg is replaced by purple icon-mic-fill.svg)
- At the same time the Play button becomes active (purple)
- At the same time the dotted audio import panel transforms to a solid grey border with a message which reads: ‘Tap Play to record with three-second countdown. Tap Stop to end recording. Tap refresh to start again.’ See audio-record1.png
- When the user taps the Play button, a three-second countdown begins with the play button being replaced by icon-three.svg, icon-two.svg, icon-one.svg, then the icon-stop-fill button while recording is in progress.
- While recording is in progress, the audio import panel text message disappears and a live waveform tracks the recording from left to right up to a point 50% of the horizontal width of the panel. As audio continues to appear at the right of the waveform, recorded audio moves out of view to the left.
- When the user taps Stop, the waveform elegantly becomes a static waveform with handles (as with import) and the Stop button returns to its active Play button state. The mic returns to its default grey state.
- The user can now listen to the recording using the Play/Pause button, or tap the refresh button (to the left (icon-start-again.svg) to clear the last recording. See audio-record2
- Tapping the refresh button clears the last recording, the waveform panel returns to its default dotted state and the microphone returns to its grey default state.

icons: icon-three.svg, icon-two.svg, icon-one.svg, icon-play-fill-svg, icon-pause-fill.svg, icon-mic-fill.svg
Visuals: audio-record1, audio-record2

**waveform**
- When tapped, the waveform toggle turns active purple and a card opens (with expand/collapse chevron to the left of the text). See waveform1.png. Create an elegant toggle exactly as the ‘two speaker’ toggle on the TTS page.
- There are three waveform choices. Two ‘above and below 0’ waveforms and one ‘above 0 only’ waveform, in the form of small tiles. An additional image - waveform2.png - is included to show the waveforms at a larger size.
- When a waveform is selected, the border turns active purple and the waveform is displayed as a layer on the image above
- Beneath the waveform selectors are two waveform colour buttons: default white (white button with pale grey active circle around it) and a RAINBOW-style multi-colour selector.
- The waveform appears initially as a static image towards the bottom of the image and can be moved and resized (including stretched up/down) by dragging or using the handles to corners and sides.
- When the play button is pressed the waveform border disappears and it plays as a live waveform. When tapped again while the audio is paused, it can be resized again.
- If the waveform is tapped while playing is in progress, the audio is paused and the border with handles displays.

Visuals: waveform1.png, waveform2.png

**Title**
- When the title toggle is tapped it opens a card. Create an elegant toggle exactly as the ‘two speaker’ toggle on the TTS page. 
- The card consists on a text input window with placeholder ‘Add title’ text. Allow titles to be turned onto additional lines by the user and make the input box resizeable.
- When text is entered, it appears in the default font/size towards the top of the image and centered. The text has a border with handles to corners and sides which allow it to be resized and repositioned on the image
- Under the text input window is a row with:
	- Fonts: Choice of Inter (bold) - default, Roboto Slab, Lora. 
	- Style: Text can be x colour on transparent background OR white text on x colour background. Default is white text (Inter Bold) on transparent background.
- Font and style options sit within round corner boxes, which turn from grey #777777 to purple when selected.
- The same two colour pickers as in the waveform section (white default plus rainbow colour picker) should be included

Visuals: title.png

**Light effect**
- This is a toggle panel with dropdown. It follows the style of toggle panels above.
- When active, the effect places a gently moving bokeh light flare effect over the image, text and waveform. It should not unduly affect the colours of the main image and the effect should be concentrated around the frame of the image, rather than obscuring the image, title and waveform.
- The effect has two controls: Opacity and Speed (sliders). Create an elegant slider exactly as in the TTS page. Both sliders are centered by default, allowing for increased/decreased speed, and increased/decreased opacity

Visual: light.png

This is AudioFlam, a free TTS and audiogram creator for use in training journalists in Africa. You are the lead coder in this project and a UI/UX expert. Read ROADMAP.md to begin coding the next phase in AudioFlam development. Pause after each step to allow local testing. Raise any challenges or opportunities along the way, advise on any best-practice that will help improve the app as we go.