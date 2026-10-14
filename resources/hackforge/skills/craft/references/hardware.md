# Playbook: Hardware prototypes

**When:** hardware is provided or allowed on site, IoT/sensing/robotics challenges, a physical demo would beat a screen.

- **PlatformIO** (`pip install platformio`): `pio project init -b esp32dev` (or `uno`, `pico`), code in `src/main.cpp`, `pio run -t upload`, `pio device monitor`. Pin libraries in `platformio.ini`.
- **arduino-cli** as a lighter alternative; **MicroPython** (`mpremote`) for fast iteration on ESP32/Pico.
- **No hardware yet?** Simulate in Wokwi (browser) and write the firmware against it, keeping pin maps in one header.
- Design for the demo: a serial/HTTP/MQTT bridge to the dashboard, a fallback replay of recorded sensor data if the live link fails, clear status LEDs.
- Document wiring as a diagram (Fritzing or a clean SVG) and a BOM with costs — judges like feasibility.
