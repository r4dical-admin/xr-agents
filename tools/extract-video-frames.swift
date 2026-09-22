import AppKit
import AVFoundation
import Foundation

guard CommandLine.arguments.count == 3 else {
  fputs("usage: extract-video-frames <video> <output-directory>\n", stderr)
  exit(2)
}

let video = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let asset = AVURLAsset(url: video)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = NSSize(width: 1600, height: 900)
let duration = CMTimeGetSeconds(asset.duration)

for (index, fraction) in [0.08, 0.24, 0.40, 0.56, 0.72, 0.88].enumerated() {
  let time = CMTime(seconds: duration * fraction, preferredTimescale: 600)
  let image = try generator.copyCGImage(at: time, actualTime: nil)
  let bitmap = NSBitmapImageRep(cgImage: image)
  guard let data = bitmap.representation(using: .png, properties: [:]) else { continue }
  try data.write(to: output.appendingPathComponent(String(format: "frame-%02d.png", index + 1)))
}
