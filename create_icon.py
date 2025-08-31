from PIL import Image, ImageDraw

# Create a 256x256 icon
size = 256
img = Image.new('RGBA', (size, size), (30, 30, 46, 255))  # Dark background

draw = ImageDraw.Draw(img)

# Draw purple rounded rectangle
purple = (139, 92, 246, 255)
draw.rounded_rectangle([32, 32, 224, 224], radius=24, fill=purple)

# Draw 4 white pads
pad_size = 64
padding = 56
white = (255, 255, 255, 230)

# Top-left pad
draw.rounded_rectangle([padding, padding, padding+pad_size, padding+pad_size], radius=8, fill=white)

# Top-right pad  
white2 = (255, 255, 255, 180)
draw.rounded_rectangle([136, padding, 136+pad_size, padding+pad_size], radius=8, fill=white2)

# Bottom-left pad
draw.rounded_rectangle([padding, 136, padding+pad_size, 136+pad_size], radius=8, fill=white2)

# Bottom-right pad
white3 = (255, 255, 255, 130)
draw.rounded_rectangle([136, 136, 136+pad_size, 136+pad_size], radius=8, fill=white3)

# Save as PNG
img.save('icon.png')
print("Icon created: icon.png")