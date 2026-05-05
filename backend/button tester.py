import RPi.GPIO as GPIO
import time

BUTTON_PIN = 4  # Change this to your button's GPIO pin

GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)
GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

print(f"Button tester ready on GPIO {BUTTON_PIN}")
print("Press the button...")

try:
    while True:
        if GPIO.input(BUTTON_PIN) == GPIO.LOW:
            print("? BUTTON PRESSED!")
            time.sleep(0.3)  # debounce
        else:
            print("? waiting...", end="\r")
        time.sleep(0.1)

except KeyboardInterrupt:
    print("\nExiting...")
    GPIO.cleanup()