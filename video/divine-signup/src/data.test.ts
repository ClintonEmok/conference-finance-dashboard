import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseMedia } from "@remotion/media-parser"
import { nodeReader } from "@remotion/media-parser/node"
import { describe, expect, it } from "vitest"

import {
  AUDIO_DELAY_FRAMES,
  calculatedRegistrationTotalMinor,
  divineRegistration,
  selectedTicket,
  storyScenes,
  totalDurationInFrames,
  VIDEO_FPS,
} from "./data"

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

  it("keeps all eight scenes and the 90.6-second runtime", () => {
    expect(storyScenes).toHaveLength(8)
    expect(AUDIO_DELAY_FRAMES).toBe(20)
    expect(totalDurationInFrames).toBe(2_718)
    expect(totalDurationInFrames / VIDEO_FPS).toBe(90.6)
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
    for (const scene of storyScenes) {
      const audioPath = fileURLToPath(
        new URL(
          `../../../public/video/divine-signup/${scene.audioFile}`,
          import.meta.url
        )
      )
      expect(existsSync(audioPath), audioPath).toBe(true)

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
