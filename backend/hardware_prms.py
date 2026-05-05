import RPi.GPIO as GPIO
import requests
import time


# --- PINS AND CONFIG ---
DIGIT_PINS = [
    [18, 23, 24, 25, 8, 16, 7],  # Hundreds 
    [5, 6, 13, 19, 26, 21, 20],   # Tens
    [17, 27, 22, 10, 9, 11, 12]    # Ones
]

BUTTON_PIN = 4 # Physical Pin 7


# Ensure this matches your Django server's IP
# If running on the same Pi, use 127.0.0.1. 
# If running on your Laptop, use the Laptop's IP (e.g., 192.168.1.XX)
API_URL = "http://127.0.0.1:8000/queue/trigger-next/"


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


def on_button_press(channel):
    print("\n[DETECTED] Button clicked on Pin 7!")
    print(f"Connecting to: {API_URL}...")
    
    try:
        # We add a timeout so the script doesn't freeze if the server is off
        response = requests.post(API_URL, timeout=2)
        
        if response.status_code == 200:
            new_num = response.json().get('new_number', 0)
            print(f"✅ SERVER SUCCESS! New Number: {new_num}")
            update_leds(new_num)
        else:
            print(f"⚠️ SERVER ERROR: {response.status_code}")
            update_leds("---") # Show dashes if error
            
    except requests.exceptions.ConnectionError:
        print("❌ CONNECTION FAILED: Is the Django server running?")
        update_leds("---")
    except Exception as e:
        print(f"❌ ERROR: {e}")


# --- STARTUP ---
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)
for digit in DIGIT_PINS:
    for pin in digit:
        GPIO.setup(pin, GPIO.OUT)
        GPIO.output(pin, 0)


GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.add_event_detect(BUTTON_PIN, GPIO.FALLING, callback=on_button_press, bouncetime=1000)


print("READY. Press the physical button now...")
update_leds("000") # Show 000 to prove the screen works


try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    GPIO.cleanup()
