# TTS Page Redesign - Historical Record

**Status:** ✅ Completed (February 2026)

---

## Archive Note

This document records the TTS page redesign completed in February 2026. The redesign introduced the mode toggle and unified "Adjust audio" controls. The feature is now complete and deployed.

**Preserved for reference** if similar UI redesigns are planned, or to understand how this design was arrived at.

**For current TTS implementation:** See code in `src/routes/+page.svelte`.

---

## Summary of Changes

## Overview
Successfully redesigned the TTS page to eliminate confusion between one-speaker and two-speaker modes by introducing a prominent mode toggle at the top of the page. All audio controls are now organized in a single, unified "Adjust audio" dropdown that becomes active after audio generation.

---

## UI Changes

### 1. **New Mode Toggle at Top** ✅
- **Location**: Just below the page header, above all other content
- **Design**: Single container with two side-by-side buttons
  - Active mode: White text on brand purple (#5422b0)
  - Inactive mode: Purple text on white background with purple border outline
  - Labels: "One speaker" | "Two speakers"
- **Behavior**: 
  - Clicking a mode button switches to that mode
  - Automatically resets audio (stops playback, clears audio, resets all speed/silence controls)
  - "Adjust audio" dropdown closes when switching modes
  - Smooth transitions between states

### 2. **One-Speaker Mode Layout** (top-to-bottom)
1. ✅ Mode toggle (new)
2. ✅ "Select voice" dropdown (existing)
3. ✅ Text input area (existing)
4. ✅ Play/Pause/Skip controls (existing)
5. ✅ **"Adjust audio" dropdown** (NEW - replaces separate speed/silence controls)
   - Closed by default
   - Activates after audio generation
   - Contains Speed and Silence sliders side-by-side (no individual panels)
6. ✅ Download button (existing)
7. ✅ Add to audiogram button (existing)

### 3. **Two-Speaker Mode Layout** (top-to-bottom)
1. ✅ Mode toggle (new)
2. ✅ **Speaker 1 and Speaker 2 dropdowns side-by-side** (moved from nested card)
   - Now appear immediately after mode toggle
   - Always visible in two-speaker mode
3. ✅ Text input area (existing)
4. ✅ Play/Pause/Skip controls (existing)
5. ✅ **"Adjust audio" dropdown** (NEW - consolidates all audio adjustments)
   - Closed by default
   - Activates after audio generation
   - Contains:
     - Row 1: Speaker 1 Speed | Speaker 2 Speed (side-by-side)
     - Row 2: Speaker 1 Silence | Speaker 2 Silence (side-by-side)
   - No individual panel wrappers around sliders
6. ✅ Download button (existing)
7. ✅ Add to audiogram button (existing)

---

## Code Changes

### State Management
- ✅ Removed `twoSpeakerCardOpen` state (no longer needed)
- ✅ Removed `twoSpeakerRef` binding (no longer needed)
- ✅ Added `adjustAudioOpen` state to manage "Adjust audio" dropdown
- ✅ Kept all audio processing logic unchanged

### Removed Components/Functions
- ✅ Removed `handleClickOutside()` function (no longer needed for card closing)
- ✅ Removed `svelte:window` event listeners for click/touch outside

### UI Components Still Used
- ✅ `VoiceDropdown.svelte` (unchanged, single voice for one-speaker mode)
- ✅ `SpeedSlider.svelte` (reused in adjust audio section for two-speaker mode)
- ✅ `SilenceSlider.svelte` (reused in adjust audio section for two-speaker mode)
- ✅ `SpeedSilenceControls.svelte` (removed from markup, functionality integrated directly)

### Styling Updates
- ✅ Added `.mode-toggle-container` - Main container for toggle buttons
- ✅ Added `.mode-toggle-btn` - Individual toggle button styling
- ✅ Added `.adjust-audio-section` - Main container for adjust audio dropdown
- ✅ Added `.adjust-audio-header` - Header button for dropdown toggle
- ✅ Added `.adjust-audio-content` - Content area when dropdown is open
- ✅ Added `.adjust-audio-row` - Flex container for side-by-side sliders
- ✅ Added `.adjust-audio-column` - Flex container for stacked rows (two-speaker)
- ✅ Added `.adjust-audio-slider` - Individual slider wrapper
- ✅ Added `.discrete-slider` - Slider styling (moved from SpeedSilenceControls)
- ✅ Added `.slider-labels` and `.slider-label` - Slider label styling
- ✅ Added `.speaker-dropdowns-row-top` - Styling for speaker dropdowns in two-speaker mode
- ✅ Removed old `.two-speaker-section`, `.two-speaker-toggle-row`, `.toggle-switch`, `.toggle-thumb`, `.two-speaker-divider` styles
- ✅ Removed old `.speaker-speeds-section`, `.speaker-speeds-label`, `.speaker-speeds-row` styles

---

## Preserved Functionality

### All Existing Features Unchanged
- ✅ TTS audio generation (Azure + YarnGPT providers)
- ✅ Single speaker voice selection
- ✅ Two-speaker dialogue parsing (Speaker: text format)
- ✅ Speed adjustment (Default/Lively/Fast) - now in "Adjust audio"
- ✅ Silence removal (Default/Trim/Tight) - now in "Adjust audio"
- ✅ Play/Pause/Skip controls
- ✅ Audio download with custom filename
- ✅ Add to audiogram button
- ✅ Tab navigation (TTS/Audiogram)
- ✅ Text input validation (4000 character limit)
- ✅ Audio duration display
- ✅ Speed block modal (prevents speed changes before audio is generated)

---

## Benefits of This Redesign

1. **Eliminates Mode Confusion**: Clear visual distinction between one-speaker and two-speaker modes with prominent toggle
2. **Cleaner Layout**: All audio controls consolidated in one place (Adjust audio section)
3. **Better UX**: Dropdowns don't hide controls; speaker selections always visible in two-speaker mode
4. **Reduced Overlapping**: Mode-reset logic prevents the "two voices overlapping" issue
5. **Intuitive Controls**: Sliders displayed side-by-side without individual panel wrappers
6. **Responsive**: Maintains side-by-side layout on mobile, no responsive changes needed

---

## Testing Checklist

- [ ] Toggle switches between one-speaker and two-speaker mode
- [ ] Audio resets when switching modes
- [ ] "Adjust audio" section is inactive/disabled until audio is generated
- [ ] "Adjust audio" opens/closes with smooth animation
- [ ] Speed sliders work correctly in both modes
- [ ] Silence sliders work correctly in both modes
- [ ] Speaker selections persist in two-speaker mode
- [ ] Download button works with correct file extension (.mp3 for one-speaker, .wav for two-speaker)
- [ ] Add to audiogram button works
- [ ] Text input and placeholder work correctly
- [ ] Play/Pause/Skip controls function properly
- [ ] Smooth transitions when toggling between modes

---

## File Modified

- `/Users/danmason/Documents/CODE/audioflam/src/routes/+page.svelte`
  - Lines: 81-102 (state changes)
  - Lines: 346-348 (removed function)
  - Lines: 987 (removed svelte:window)
  - Lines: 1016-1401 (layout restructure)
  - Lines: 1435-2227 (CSS updates)

---

## No Breaking Changes

- All APIs remain the same
- No dependency changes
- All existing functions preserved
- Component props unchanged
- Audio processing logic untouched
