import { Audio } from "@remotion/media"
import { AbsoluteFill, Sequence, staticFile } from "remotion"

import { AUDIO_DELAY_FRAMES, storyScenes, type VideoFormat } from "./data"
import { sceneComponents } from "./scenes"
import { CaptionOverlay, colors, fontFamily } from "./ui"

export function DivineSignupVideo({ format }: { format: VideoFormat }) {
  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        color: colors.foreground,
        fontFamily,
      }}
    >
      {storyScenes.map((scene, index) => {
        const Scene = sceneComponents[scene.id]
        const from = storyScenes
          .slice(0, index)
          .reduce(
            (total, previousScene) => total + previousScene.durationInFrames,
            0
          )

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={scene.durationInFrames}
          >
            <Scene format={format} durationInFrames={scene.durationInFrames} />
            <Sequence from={AUDIO_DELAY_FRAMES} layout="none">
              <Audio
                src={staticFile(`video/divine-signup/${scene.audioFile}`)}
              />
            </Sequence>
            <CaptionOverlay captions={scene.captions} format={format} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

export function DivineSignupLandscape() {
  return <DivineSignupVideo format="landscape" />
}

export function DivineSignupPortrait() {
  return <DivineSignupVideo format="portrait" />
}
