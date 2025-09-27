# Changelog

All notable changes to SoundPad Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-09-26

### Added
- Professional Haute42-style 4x4 pad layout inspired by MPC/Maschine controllers
- Color-coded rows (blue, green, yellow, red) for better visual organization
- Custom gradient scrollbar styling with purple theme
- Visual bank indicators (MPC-style) for future expansion
- Debug logging for sound playback tracking
- Enhanced visual feedback with gradients, shadows, and animations
- Pad number badges on each button
- Active pad pulse animations with velocity indicators

### Changed
- Fixed 4x4 grid layout (16 pads) replacing dynamic grid sizing
- Improved mapping configuration interface with visual feedback
- Enhanced button hover and active states with modern transitions
- Updated UI typography with gradient text effects
- Redesigned mapping list with color-coded entries matching pad rows

### Fixed
- **Critical**: Audio file to button assignment mismatch bug
- Removed unused React imports causing warnings
- Optimized component rendering performance

## [2.0.0] - 2025-09-25

### Added
- Major production release with comprehensive improvements
- Optimized build configuration for minimal size
- Configurable controller stop button

### Fixed
- Removed hardcoded ESC key for stop-all functionality

## [1.1.0] - 2025-09-24

### Added
- Major robustness improvements and bug fixes
- Enhanced controller support
- Improved audio engine stability

### Changed
- Performance optimizations across the application

---

## Version Guidelines

- **MAJOR** version (X.0.0): Incompatible API changes or major redesigns
- **MINOR** version (0.X.0): New features in a backwards compatible manner
- **PATCH** version (0.0.X): Backwards compatible bug fixes