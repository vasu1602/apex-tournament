# Apex Velocity - Grand Prix Auction 2026

High-octane real-time racing tournament auction platform featuring dynamic team purse budgeting, live driver auction gavel, role delegation, multi-window telemetry sync, and 60FPS animated speedway canvas background.

## Features
- **Spectator Live Arena**: Real-time bidding block with current bid, lead team tag, and gavel hammer-down celebration.
- **Strict Budget Ceiling**: Automatic deduction and hard-limit validation preventing teams from over-spending.
- **Clean Roster Slots & Tier System**: Tier S, A, B, C, D driver classifications.
- **Race Control Admin Panel**: Add/edit racers, register teams, calibrate starting purses, and manage gavel outcomes.
- **Role-Based Access Control**:
  - `SOULCITYS3FULL`: Master Super Admin access
  - `SOULCITYS3`: Auctioneer / Team Leader bidding access
- **Multi-Window Telemetry Sync**: Real-time cross-tab updates via BroadcastChannel API.
- **Animated 60+ FPS Canvas Background**: Aerodynamic sports cars racing on night speedway circuit with nitro flame bursts and light trails.

## Getting Started
To run locally:
```bash
# Using Python
python -m http.server 8080

# Or using Node.js / npx
npx serve .
```
Open [http://localhost:8080](http://localhost:8080) in your browser.
