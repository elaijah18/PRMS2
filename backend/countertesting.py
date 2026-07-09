import RPi.GPIO as GPIO
import time

# --- PINS AND CONFIG ---
DIGIT_PINS = [
    [18, 23, 24, 25, 8, 16, 7],  # Hundreds 
    [5, 6, 13, 19, 26, 21, 20],   # Tens
    [17, 27, 22, 10, 9, 11, 12]    # Ones
]

SEG_MAP = {
    '0': (1,1,1,1,1,1,0), '1': (0,1,1,0,0,0,0), '2': (1,1,0,1,1,0,1),
    '3': (1,1,1,1,0,0,1), '4': (0,1,1,0,0,1,1), '5': (1,0,1,1,0,1,1),
    '6': (1,0,1,1,1,1,1), '7': (1,1,1,0,0,0,0), '8': (1,1,1,1,1,1,1),
    '9': (1,1,1,1,0,1,1), '-': (0,0,0,0,0,0,1), ' ': (0,0,0,0,0,0,0)
}

def update_leds(number):
    num_str = str(number).zfill(3)
    for i in range(3):
        pattern = SEG_MAP.get(num_str[i], SEG_MAP[' '])
        for seg_idx in range(7):
            GPIO.output(DIGIT_PINS[i][seg_idx], pattern[seg_idx])

# --- STARTUP ---
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)
for digit in DIGIT_PINS:
    for pin in digit:
        GPIO.setup(pin, GPIO.OUT)
        GPIO.output(pin, 0)

print("Counting 0 to 999...")
counter = 0

try:
    while True:
        update_leds(counter)
        print(f"Count: {counter}")
        time.sleep(0.02)       # ? change speed here (seconds per count)
        counter += 1
        if counter > 999:
            counter = 0     # loop back to 000
except KeyboardInterrupt:
    print("\nStopped.")
    GPIO.cleanup()