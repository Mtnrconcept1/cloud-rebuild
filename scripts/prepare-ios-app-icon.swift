import AppKit
import Foundation

let arguments = CommandLine.arguments

guard arguments.count == 3 else {
  fputs("Usage: swift scripts/prepare-ios-app-icon.swift <source.png> <destination.png>\n", stderr)
  exit(64)
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let destinationURL = URL(fileURLWithPath: arguments[2])
let canvasSize = 1024
let inset: CGFloat = 48

let sourceData = try Data(contentsOf: sourceURL)
guard let sourceRep = NSBitmapImageRep(data: sourceData) else {
  fputs("Unable to decode source PNG at \(sourceURL.path)\n", stderr)
  exit(65)
}

let sourceWidth = CGFloat(sourceRep.pixelsWide)
let sourceHeight = CGFloat(sourceRep.pixelsHigh)
guard sourceWidth > 0, sourceHeight > 0 else {
  fputs("Source logo has invalid dimensions.\n", stderr)
  exit(65)
}

let sourceImage = NSImage(size: NSSize(width: sourceWidth, height: sourceHeight))
sourceImage.addRepresentation(sourceRep)

guard let output = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: canvasSize,
  pixelsHigh: canvasSize,
  bitsPerSample: 8,
  samplesPerPixel: 3,
  hasAlpha: false,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 24
) else {
  fputs("Unable to allocate 1024x1024 RGB icon canvas.\n", stderr)
  exit(70)
}

output.size = NSSize(width: canvasSize, height: canvasSize)

guard let context = NSGraphicsContext(bitmapImageRep: output) else {
  fputs("Unable to create icon graphics context.\n", stderr)
  exit(70)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high

NSColor.white.setFill()
NSRect(x: 0, y: 0, width: canvasSize, height: canvasSize).fill()

let available = CGFloat(canvasSize) - (inset * 2)
let scale = min(available / sourceWidth, available / sourceHeight)
let drawWidth = sourceWidth * scale
let drawHeight = sourceHeight * scale
let drawRect = NSRect(
  x: (CGFloat(canvasSize) - drawWidth) / 2,
  y: (CGFloat(canvasSize) - drawHeight) / 2,
  width: drawWidth,
  height: drawHeight
)

sourceImage.draw(
  in: drawRect,
  from: NSRect(x: 0, y: 0, width: sourceWidth, height: sourceHeight),
  operation: .sourceOver,
  fraction: 1.0
)

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let png = output.representation(using: .png, properties: [:]) else {
  fputs("Unable to encode generated app icon as PNG.\n", stderr)
  exit(70)
}

try FileManager.default.createDirectory(
  at: destinationURL.deletingLastPathComponent(),
  withIntermediateDirectories: true
)
try png.write(to: destinationURL, options: .atomic)

print("Generated opaque 1024x1024 iOS icon from \(sourceURL.lastPathComponent).")
