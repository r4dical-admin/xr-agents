#!/usr/bin/env swift

import AppKit
import AVFoundation
import CoreVideo

guard CommandLine.arguments.count == 4 else {
    fputs("usage: encode-frame-sequence.swift FRAMES_DIR OUTPUT.mov FPS\n", stderr)
    exit(2)
}

let framesURL = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let fps = Int32(CommandLine.arguments[3]) ?? 15
let files = try FileManager.default.contentsOfDirectory(at: framesURL, includingPropertiesForKeys: nil)
    .filter { ["jpg", "jpeg", "png"].contains($0.pathExtension.lowercased()) }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

guard let firstURL = files.first,
      let firstImage = NSImage(contentsOf: firstURL),
      let firstCG = firstImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("no readable frames\n", stderr)
    exit(3)
}

let width = 1920
let height = 1080
try? FileManager.default.removeItem(at: outputURL)
try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)

let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 9_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoMaxKeyFrameIntervalKey: fps * 2
    ]
])
input.expectsMediaDataInRealTime = false

let attributes: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
guard writer.canAdd(input) else { fputs("cannot add video input\n", stderr); exit(4) }
writer.add(input)
guard writer.startWriting() else { fputs("writer failed to start\n", stderr); exit(5) }
writer.startSession(atSourceTime: .zero)

for (index, url) in files.enumerated() {
    autoreleasepool {
        guard let image = NSImage(contentsOf: url),
              let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let pool = adaptor.pixelBufferPool else { return }
        var optionalBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &optionalBuffer) == kCVReturnSuccess,
              let buffer = optionalBuffer else { return }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer),
              let context = CGContext(
                data: base,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
              ) else { return }
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        while !input.isReadyForMoreMediaData { usleep(1_000) }
        adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps))
    }
}

input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }
semaphore.wait()
guard writer.status == .completed else {
    fputs("encode failed: \(writer.error?.localizedDescription ?? "unknown error")\n", stderr)
    exit(6)
}
print(outputURL.path)
