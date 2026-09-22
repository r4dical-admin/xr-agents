#!/usr/bin/env swift

import AppKit
import AVFoundation
import QuartzCore

guard CommandLine.arguments.count == 3 else {
    fputs("usage: redact-demo-video.swift INPUT.mov OUTPUT.mov\n", stderr)
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let asset = AVURLAsset(url: inputURL)

guard let sourceVideo = asset.tracks(withMediaType: .video).first else {
    fputs("input has no video track\n", stderr)
    exit(3)
}

let duration = asset.duration
let durationSeconds = CMTimeGetSeconds(duration)
let natural = sourceVideo.naturalSize
let transformed = natural.applying(sourceVideo.preferredTransform)
let renderSize = CGSize(width: abs(transformed.width), height: abs(transformed.height))

let composition = AVMutableComposition()
guard let videoTrack = composition.addMutableTrack(
    withMediaType: .video,
    preferredTrackID: kCMPersistentTrackID_Invalid
) else {
    fputs("could not create video track\n", stderr)
    exit(4)
}

try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceVideo, at: .zero)
videoTrack.preferredTransform = sourceVideo.preferredTransform

if let sourceAudio = asset.tracks(withMediaType: .audio).first,
   let audioTrack = composition.addMutableTrack(
       withMediaType: .audio,
       preferredTrackID: kCMPersistentTrackID_Invalid
   ) {
    try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceAudio, at: .zero)
}

let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
layerInstruction.setTransform(sourceVideo.preferredTransform, at: .zero)
instruction.layerInstructions = [layerInstruction]

let videoComposition = AVMutableVideoComposition()
videoComposition.instructions = [instruction]
videoComposition.renderSize = renderSize
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

let videoLayer = CALayer()
videoLayer.frame = CGRect(origin: .zero, size: renderSize)
let overlayLayer = CALayer()
overlayLayer.frame = videoLayer.frame

func addPrivacyPanel(topLeftFrame: CGRect, label: String, start: Double, end: Double) {
    let panel = CALayer()
    panel.frame = CGRect(
        x: topLeftFrame.minX,
        y: renderSize.height - topLeftFrame.maxY,
        width: topLeftFrame.width,
        height: topLeftFrame.height
    )
    panel.backgroundColor = NSColor(calibratedRed: 0.015, green: 0.045, blue: 0.075, alpha: 1.0).cgColor
    panel.borderColor = NSColor(calibratedRed: 0.13, green: 0.75, blue: 0.95, alpha: 0.75).cgColor
    panel.borderWidth = 2
    panel.cornerRadius = 18
    panel.masksToBounds = true

    let text = CATextLayer()
    text.string = label
    text.alignmentMode = .center
    text.foregroundColor = NSColor(calibratedRed: 0.48, green: 0.87, blue: 1.0, alpha: 0.95).cgColor
    text.font = NSFont.monospacedSystemFont(ofSize: 21, weight: .medium)
    text.fontSize = 21
    text.contentsScale = 2
    text.frame = CGRect(x: 18, y: panel.bounds.midY - 16, width: panel.bounds.width - 36, height: 32)
    panel.addSublayer(text)

    if start > 0 || end < durationSeconds {
        let epsilon = min(0.002, 1.0 / max(durationSeconds, 1))
        let startKey = max(0, min(1, start / durationSeconds))
        let endKey = max(startKey, min(1, end / durationSeconds))
        let animation = CAKeyframeAnimation(keyPath: "opacity")
        animation.values = [0, 0, 1, 1, 0, 0]
        animation.keyTimes = [
            0,
            NSNumber(value: max(0, startKey - epsilon)),
            NSNumber(value: startKey),
            NSNumber(value: endKey),
            NSNumber(value: min(1, endKey + epsilon)),
            1
        ]
        animation.duration = durationSeconds
        animation.beginTime = AVCoreAnimationBeginTimeAtZero
        animation.calculationMode = .discrete
        animation.isRemovedOnCompletion = false
        panel.opacity = 0
        panel.add(animation, forKey: "privacy-window")
    }

    overlayLayer.addSublayer(panel)
}

// The source recording includes local paths, project titles, and a shell prompt.
// These opaque panels deliberately remove that metadata from the public demo.
addPrivacyPanel(
    topLeftFrame: CGRect(x: 0, y: 12, width: 690, height: 92),
    label: "LOCAL PROJECT METADATA HIDDEN",
    start: 0,
    end: durationSeconds
)
addPrivacyPanel(
    topLeftFrame: CGRect(x: 1390, y: 110, width: 530, height: 600),
    label: "LOCAL TERMINAL DETAILS HIDDEN",
    start: 0,
    end: 5.2
)
addPrivacyPanel(
    topLeftFrame: CGRect(x: 175, y: 105, width: 1055, height: 895),
    label: "LOCAL CHAT LIBRARY HIDDEN",
    start: 4.2,
    end: 17.2
)
addPrivacyPanel(
    topLeftFrame: CGRect(x: 0, y: 105, width: 610, height: 895),
    label: "LOCAL CHAT LIBRARY HIDDEN",
    start: 16.0,
    end: durationSeconds
)

let parentLayer = CALayer()
parentLayer.frame = videoLayer.frame
parentLayer.addSublayer(videoLayer)
parentLayer.addSublayer(overlayLayer)
videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
    postProcessingAsVideoLayer: videoLayer,
    in: parentLayer
)

try? FileManager.default.removeItem(at: outputURL)
try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)

guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    fputs("could not create export session\n", stderr)
    exit(5)
}

exporter.outputURL = outputURL
exporter.outputFileType = .mov
exporter.videoComposition = videoComposition
exporter.shouldOptimizeForNetworkUse = true

let semaphore = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { semaphore.signal() }
semaphore.wait()

guard exporter.status == .completed else {
    fputs("export failed: \(exporter.error?.localizedDescription ?? "unknown error")\n", stderr)
    exit(6)
}

print(outputURL.path)
