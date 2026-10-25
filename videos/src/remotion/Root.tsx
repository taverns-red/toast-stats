import type { ReactElement } from 'react'
import { Composition, type CalculateMetadataFunction } from 'remotion'
import { getScenario } from '../scenarios'
import { HowToVideo, type HowToVideoProps } from './HowToVideo'

export const COMPOSITION_ID = 'HowTo'
export const WIDTH = 1920
export const HEIGHT = 1080

const calculateMetadata: CalculateMetadataFunction<HowToVideoProps> = ({
  props,
}) => {
  const scenario = getScenario(props.scenarioId)
  return {
    fps: scenario.fps,
    durationInFrames: Math.round(scenario.durationSec * scenario.fps),
  }
}

export function Root(): ReactElement {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={HowToVideo}
      width={WIDTH}
      height={HEIGHT}
      fps={30}
      durationInFrames={30 * 30}
      defaultProps={{ scenarioId: 'v2', manifest: null } as HowToVideoProps}
      calculateMetadata={calculateMetadata}
    />
  )
}
