import { Composition } from "remotion"

import { DivineSignupLandscape, DivineSignupPortrait } from "./composition"
import { totalDurationInFrames, VIDEO_FPS } from "./data"

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="DivineSignupLandscape"
        component={DivineSignupLandscape}
        durationInFrames={totalDurationInFrames}
        fps={VIDEO_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="DivineSignupPortrait"
        component={DivineSignupPortrait}
        durationInFrames={totalDurationInFrames}
        fps={VIDEO_FPS}
        width={1080}
        height={1920}
      />
    </>
  )
}
