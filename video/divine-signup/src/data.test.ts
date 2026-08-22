import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseMedia } from "@remotion/media-parser"
import { nodeReader } from "@remotion/media-parser/node"
import { describe, expect, it } from "vitest"

import {
  AUDIO_DELAY_FRAMES,
  calculatedRegistrationTotalMinor,
  divineRegistration,
  REVIEW_VERIFICATION_FRAME,
  selectedTicket,
  storyScenes,
  totalDurationInFrames,
  VIDEO_FPS,
} from "./data"

type VoiceoverMetadata = {
  engine: { name: string; version: string }
  encoder: {
    name: string
    version: string
    format: string
    bitrate: string
    sampleRate: number
  }
  model: { repository: string; revision: string }
  voice: {
    repository: string
    revision: string
    id: string
    languageCode: string
    speed: number
  }
  files: Record<
    string,
    { durationSeconds: number; sha256: string; sizeBytes: number }
  >
}

const audioDirectory = fileURLToPath(
  new URL("../../../public/video/divine-signup/", import.meta.url)
)
const voiceoverMetadata = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../public/video/divine-signup/voiceover-metadata.json",
        import.meta.url
      )
    ),
    "utf8"
  )
) as VoiceoverMetadata

describe("Divine signup video contract", () => {
  it("keeps the registration arithmetic internally consistent", () => {
    const accommodation = divineRegistration.accommodation

    expect(selectedTicket.priceMinor).toBe(35_000)
    expect(accommodation.cotPerNightMinor).toBe(1_000)
    expect(accommodation.cotQuantity).toBe(1)
    expect(accommodation.cotNights).toBe(2)
    expect(accommodation.cotMinor).toBe(2_000)
    expect(accommodation.superiorUpgradeMinor).toBe(2_000)
    expect(accommodation.nightBeforeBaseMinor).toBe(6_000)
    expect(accommodation.nightBeforeSuperiorUpgradeMinor).toBe(1_000)
    expect(accommodation.nightBeforeMinor).toBe(7_000)
    expect(divineRegistration.totalMinor).toBe(46_000)
    expect(accommodation.superiorUpgradeMinor).toBe(
      accommodation.superiorUpgradePerPersonPerNightMinor *
        divineRegistration.attendeeCount *
        accommodation.nights
    )
    expect(accommodation.cotMinor).toBe(
      accommodation.cotPerNightMinor *
        accommodation.cotQuantity *
        accommodation.cotNights
    )
    expect(calculatedRegistrationTotalMinor).toBe(divineRegistration.totalMinor)

    const selectedNightBefore = accommodation.nightBeforeRates.find(
      (rate) => rate.label === accommodation.nightBeforeLabel
    )
    expect(selectedNightBefore?.priceMinor).toBe(accommodation.nightBeforeMinor)
    expect(
      accommodation.nightBeforeBaseMinor +
        accommodation.nightBeforeSuperiorUpgradeMinor
    ).toBe(accommodation.nightBeforeMinor)
  })

  it("limits the breakfast claim to the selected night-before stay", () => {
    expect(
      divineRegistration.accommodation.breakfastIncludedWithIncludedStay
    ).toBe(false)
    expect(
      divineRegistration.accommodation.breakfastIncludedWithNightBefore
    ).toBe(true)
  })

  it("matches the live Divine Redesign signup catalog", () => {
    expect(divineRegistration.eventName).toBe("Divine Redesign")
    expect(
      divineRegistration.tickets.map(({ label, priceMinor }) => [
        label,
        priceMinor,
      ])
    ).toEqual([
      ["Single Room", 35_000],
      ["18+", 25_000],
      ["12-17", 15_000],
      ["3-11", 12_500],
      ["under 3", 0],
    ])
    expect(divineRegistration.accommodation.nightBeforeRates).toEqual([
      { label: "Standard · Single", priceMinor: 9_000 },
      { label: "Standard · Shared", priceMinor: 6_000 },
      { label: "Superior · Single", priceMinor: 10_000 },
      { label: "Superior · Shared", priceMinor: 7_000 },
    ])
  })

  it("keeps all eight scenes and the Heart narration runtime", () => {
    expect(storyScenes).toHaveLength(8)
    expect(AUDIO_DELAY_FRAMES).toBe(20)
    expect(totalDurationInFrames).toBe(2_850)
    expect(totalDurationInFrames / VIDEO_FPS).toBe(95)
  })

  it("keeps smoke frames inside their named scenes", () => {
    const smokeScript = readFileSync(
      fileURLToPath(new URL("../scripts/smoke-render.sh", import.meta.url)),
      "utf8"
    )
    const expectedSceneByShot = {
      start: "welcome",
      options: "options",
      "review-details": "review",
      "review-verification": "review",
      confirmation: "confirmation",
      end: "confirmation",
    } as const
    const sceneRanges = storyScenes.map((scene, index) => {
      const start = storyScenes
        .slice(0, index)
        .reduce((total, item) => total + item.durationInFrames, 0)
      return { id: scene.id, start, end: start + scene.durationInFrames }
    })
    const sceneStarts = Object.fromEntries(
      sceneRanges.map((scene) => [scene.id, scene.start])
    ) as Record<(typeof storyScenes)[number]["id"], number>
    const expectedFrameByShot = {
      start: 0,
      options: sceneStarts.options + 156,
      "review-details": sceneStarts.review + REVIEW_VERIFICATION_FRAME - 16,
      "review-verification":
        sceneStarts.review + REVIEW_VERIFICATION_FRAME + 34,
      confirmation: sceneStarts.confirmation + 157,
      end: totalDurationInFrames - 1,
    } as const
    const smokeFrames = Array.from(
      smokeScript.matchAll(
        /render_frame DivineSignup(Landscape|Portrait) (\d+) (?:landscape|portrait)-([\w-]+) /g
      )
    )

    expect(smokeFrames).toHaveLength(12)
    for (const [, , frameText, shot] of smokeFrames) {
      const frame = Number(frameText)
      const shotName = shot as keyof typeof expectedSceneByShot
      const scene = sceneRanges.find(
        (range) => frame >= range.start && frame < range.end
      )
      expect(frame, shot).toBe(expectedFrameByShot[shotName])
      expect(scene?.id, `${shot} at frame ${frame}`).toBe(
        expectedSceneByShot[shotName]
      )

      if (shotName === "review-details") {
        expect(frame - sceneStarts.review).toBeLessThan(
          REVIEW_VERIFICATION_FRAME
        )
      }
      if (shotName === "review-verification") {
        expect(frame - sceneStarts.review).toBeGreaterThanOrEqual(
          REVIEW_VERIFICATION_FRAME
        )
      }
    }
  })

  it("keeps captions inside narration and narration inside each scene", () => {
    for (const scene of storyScenes) {
      expect(scene.captions[0]?.startSeconds).toBe(0)

      for (const [index, caption] of scene.captions.entries()) {
        expect(caption.startSeconds).toBeLessThan(caption.endSeconds)
        expect(caption.endSeconds).toBeLessThanOrEqual(
          scene.audioDurationSeconds
        )

        if (index > 0) {
          expect(caption.startSeconds).toBe(
            scene.captions[index - 1]?.endSeconds
          )
        }
      }

      expect(
        AUDIO_DELAY_FRAMES + scene.audioDurationSeconds * VIDEO_FPS
      ).toBeLessThan(scene.durationInFrames)
    }
  })

  it("matches every referenced narration asset and duration", async () => {
    const audioFiles = readdirSync(audioDirectory)
      .filter((file) => file.endsWith(".mp3"))
      .sort()
    const referencedFiles = storyScenes.map((scene) => scene.audioFile).sort()

    expect(audioFiles).toEqual(referencedFiles)
    expect(Object.keys(voiceoverMetadata.files).sort()).toEqual(referencedFiles)
    expect(voiceoverMetadata.engine).toEqual({
      name: "mlx-audio",
      version: "0.5.0",
    })
    expect(voiceoverMetadata.encoder).toMatchObject({
      name: "ffmpeg",
      format: "mp3",
      bitrate: "128k",
      sampleRate: 24_000,
    })
    expect(voiceoverMetadata.encoder.version).toMatch(/^ffmpeg version /)
    expect(voiceoverMetadata.model).toEqual({
      repository: "mlx-community/Kokoro-82M-bf16",
      revision: "a71e4d38b236d968966a2002c4c895dbd12b1c3c",
    })
    expect(voiceoverMetadata.voice).toMatchObject({
      repository: "prince-canuma/Kokoro-82M",
      revision: "e02c9eada7ce7416798af36b190a8a2dd2ecd566",
      id: "af_heart",
      languageCode: "a",
      speed: 0.96,
    })

    for (const scene of storyScenes) {
      const audioPath = fileURLToPath(
        new URL(
          `../../../public/video/divine-signup/${scene.audioFile}`,
          import.meta.url
        )
      )
      expect(existsSync(audioPath), audioPath).toBe(true)

      const contents = readFileSync(audioPath)
      const recorded = voiceoverMetadata.files[scene.audioFile]
      expect(recorded).toBeDefined()
      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        recorded?.sha256
      )
      expect(contents.byteLength).toBe(recorded?.sizeBytes)
      expect(recorded?.durationSeconds).toBe(scene.audioDurationSeconds)

      const metadata = await parseMedia({
        src: audioPath,
        fields: { durationInSeconds: true },
        reader: nodeReader,
        acknowledgeRemotionLicense: true,
      })
      if (metadata.durationInSeconds === null) {
        throw new Error(`No duration metadata found for ${audioPath}`)
      }
      expect(
        Math.abs(metadata.durationInSeconds - scene.audioDurationSeconds)
      ).toBeLessThan(0.1)
    }
  })
})
