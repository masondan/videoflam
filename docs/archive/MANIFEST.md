# Archive Manifest - Historical Documentation

**Purpose:** Reference documents for understanding past development iterations and design decisions  
**Note:** These are historical records. For current reference, use `/AGENTS.md` (single source of truth).

---

## Archive Status Guide

### ✅ HIGHLY VALUABLE - Read these for context:
- **EXPORT_TECH_PLAN.md** - Why WebCodecs + Mediabunny was chosen over alternatives
- **ROADMAP.md** - 14-step development timeline and completion status
- **MOBILE_EXPORT_FIX.md** - Black-screen issue diagnostic approach (learning resource)
- **EXPORT_FIX_IMPLEMENTATION.md** - How RAF loop decoupling fixed export stuttering

### ⚠️ REFERENCE-ONLY - Use when needed:
- **DESIGN_VISION.md** - Original design specification (design tokens now in `src/app.css` + AGENTS.md)
- **TTS_REDESIGN_SUMMARY.md** - TTS UI redesign history (completed February 2026, implementation in code)

### ❌ OBSOLETE - Don't read these:
- **COMPLETION_REPORT.md** - Use AGENTS.md "Current Phase Focus" section instead
- **AUDIT_REPORT.md** - Issues consolidated in `/docs/CHALLENGES_AND_FIXES.md`

---

## Summary

**Why this archive exists:** Historical documentation preserving why decisions were made. For current reference, all essential info is in `/AGENTS.md`.

**For persistent issues and fixes:** See `/docs/CHALLENGES_AND_FIXES.md` (consolidated reference). Archive docs provide additional context if needed.

---

## What's in This Archive

### 1. **EXPORT_TECH_PLAN.md**
**Status:** Planning document (January 2026)  
**Why it's here:** Documents the original two-phase approach to solving mobile export

**Contents:**
- Executive summary of the H.264 MediaRecorder failure problem (85% of Android users)
- Deep dive: Why WebCodecs + Mediabunny was chosen over FFmpeg.wasm
- Detailed Phase 1 implementation (WebCodecs + mp4-muxer library analysis)
- Phase 2 fallback strategies (Cloudinary vs api.video cost analysis)
- Browser support matrix
- Risk assessment and success criteria

**When to read:**
- You're implementing a new export strategy and want to understand prior analysis
- You need to explain to stakeholders why WebCodecs is better than alternatives
- You're considering switching to a different solution (check risks first!)

**Key takeaway:** api.video was chosen over Cloudinary because:
- Free encoding (no credit consumption)
- ~$0.003/video for storage/delivery
- Better for educational, non-commercial use case

---

### 2. **MOBILE_EXPORT_FIX.md**
**Status:** Diagnostic build documentation (August 2025)  
**Why it's here:** Raw diagnostics from the black-screen debugging session

**Contents:**
- Issue summary: MediaRecorder errors and 0-byte blobs on mobile
- Root cause hypotheses (canvas stream, audio track, codec, mixed streams)
- Detailed diagnostic code added to each file
- Expected output logs (what to look for when testing)
- Testing checklist
- Next steps if diagnostics still fail

**When to read:**
- Export is producing black screens or failing silently
- You want to understand the diagnostic approach used previously
- You need to add more debugging for a specific failure mode

**Key logs to watch for:**
- `[VideoExport] Device: Mobile`
- `[VideoExport] Canvas stream created:`
- `[VideoExport] Audio stream tracks:`
- `[VideoExport] Selected mime type:`

---

### 3. **EXPORT_FIX_IMPLEMENTATION.md**
**Status:** Implementation notes (August 2025)  
**Why it's here:** Documents the "decoupled render loop" solution that fixed black screens

**Contents:**
- The problem: External RAF loop callbacks with loose timing
- The solution: Move RAF loop inside `exportCanvasVideo()`
- Why this fixes mobile: Tight synchronization guarantees
- How it works: Simplified flow diagram
- Files modified summary
- Testing recommendations

**When to read:**
- Export logic is being refactored and you need to understand why tight RAF coupling matters
- You're debugging frame delivery gaps
- You want to understand why we don't have external render callbacks anymore

**Key insight:** RAF loop MUST run synchronously during MediaRecorder recording. External start/stop callbacks are too loose.

---

### 4. **AUDIT_REPORT.md**
**Status:** Performance audit report (January 2026)  
**Why it's here:** Identified and documented critical audio pipeline issues

**Contents:**
- Executive summary: 5 critical issues found and fixed
- **Base64 double-conversion bug** (10-15ms latency per generation)
- **MIME type inconsistency** between Azure and YarnGPT responses
- **Unused dependencies** (lamejs, speech-sdk, node-fetch)
- **Missing event listener cleanup** (memory leak after 10+ generations)
- Performance impact summary
- Code quality improvements
- Testing recommendations

**When to read:**
- Audio playback feels sluggish and you want to understand why
- You're refactoring the TTS pipeline
- You need to explain why certain patterns are wrong (e.g., double-conversion)

**Key fixes applied:**
1. Direct Uint8Array allocation (no intermediate Array)
2. Both providers return `{ audioContent, format: 'mp3' }`
3. Removed: lamejs, speech-sdk, node-fetch
4. Named handler functions for cleanup

---

### 5. **ROADMAP.md**
**Status:** Implementation roadmap (January 2026, partially complete)  
**Why it's here:** Original step-by-step plan for building Audiogram feature

**Contents:**
- 14 sequential implementation steps (Step 1 through Step 14)
- Design asset references (`info/` folder with mockups)
- For each step: objective, design reference, implementation details, test criteria
- Technical architecture overview
- File structure after implementation
- Dependencies to add (FFmpeg.wasm, fonts)
- Testing strategy

**When to read:**
- You're implementing new Audiogram features and want to see what was planned
- You need to understand the original step progression
- Steps 2-7 are largely complete, steps 8-14 may have been done differently

**Status of steps:**
- ✅ Step 1: Header navigation & tab switching (DONE)
- ✅ Step 2-11: Audiogram UI components (DONE)
- 🔄 Step 12-14: Export & polish (PARTIALLY DONE—WebCodecs used instead of FFmpeg.wasm)

---

## How AI Agents Should Use This Archive

### Quick reference decision flow:

```
Q: "How do I implement X?"
└─ Check AGENTS.md first

Q: "Why did we choose X instead of Y?"
└─ Check EXPORT_TECH_PLAN.md (export decisions) 
   or AUDIT_REPORT.md (audio pipeline decisions)
   or ROADMAP.md (original feature plan)

Q: "Export is failing, where do I look?"
└─ Check MOBILE_EXPORT_FIX.md for diagnostics
   Check TROUBLESHOOTING.md (project root) for fixes

Q: "Why is the RAF loop inside the export function?"
└─ Check EXPORT_FIX_IMPLEMENTATION.md for history

Q: "What was the original implementation plan?"
└─ Check ROADMAP.md for steps and progression
```

---

## Document Cross-References

| Document | References | Referenced By |
|----------|-----------|-----------------|
| EXPORT_TECH_PLAN.md | (none, self-contained) | AGENTS.md, TROUBLESHOOTING.md |
| MOBILE_EXPORT_FIX.md | EXPORT_FIX_IMPLEMENTATION.md | AGENTS.md |
| EXPORT_FIX_IMPLEMENTATION.md | MOBILE_EXPORT_FIX.md | AGENTS.md |
| AUDIT_REPORT.md | (none, self-contained) | AGENTS.md |
| ROADMAP.md | design assets in `/info` | AGENTS.md |

---

## Recommended Reading Order

**For new agents:**
1. Read: `AGENTS.md` (project root)
2. Read: `docs/ARCHITECTURE.md`
3. Read: `docs/TROUBLESHOOTING.md`
4. Skim: This manifest
5. (optional) Deep dive: Specific archive docs based on task

**For export system work:**
1. Read: `AGENTS.md` → Export Architecture section
2. Read: `docs/ARCHITECTURE.md` → Export Pipeline sections
3. Read: EXPORT_TECH_PLAN.md (why this approach)
4. Read: EXPORT_FIX_IMPLEMENTATION.md (how it works)
5. Read: MOBILE_EXPORT_FIX.md (diagnostics if broken)

**For audio/TTS work:**
1. Read: `AGENTS.md` → TTS Providers section
2. Read: `docs/ARCHITECTURE.md` → TTS Pipeline
3. Read: AUDIT_REPORT.md (critical issues fixed)
4. Read: `docs/TROUBLESHOOTING.md` → TTS Issues

**For new features:**
1. Read: ROADMAP.md → Study step progression
2. Read: `AGENTS.md` → Current state
3. Implement new feature informed by both perspectives

---

## Archive Maintenance Notes

**For maintainers:**
- Do NOT delete these documents—they preserve important context
- Periodically review ROADMAP.md to track completion
- When adding new decisions, document in AGENTS.md with a note like:
  ```
  ### Why we chose X (see archive/REASON.md for full analysis)
  ```
- Move very old documents (>6 months, superseded) to subdirectory `old/`

**For agents:**
- These documents may be slightly outdated (written months ago)
- Always cross-check with AGENTS.md for current status
- File paths, API endpoints, component names may have changed
- Use as decision reference, not absolute truth about current code

---

**Last Updated:** February 2026
