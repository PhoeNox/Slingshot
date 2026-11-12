# Deterministic simulation core

The simulation runs at a fixed 30 Hz step, is DOM-free, and draws all randomness from a seeded PRNG, so a round is fully determined by its seed and the sequence of shot records. Shot records carry launch point and velocity `{x, y, vx, vy}` rather than angle and power, and planet radii are quantized to 1/1024, so that no transcendental math (whose last bits may differ between JS engines) feeds the per-step physics. This keeps future peer-to-peer play a matter of exchanging seeds and shot records, without host-authoritative state sync.
