import type { ReactElement } from 'react'
import { Composition, type CalculateMetadataFunction } from 'remotion'
import { LAYOUTS } from '../layout'
import { getScenario } from '../scenarios'
import { HowToVideo, type HowToVideoProps } from './HowToVideo'

export const COMPOSITION_ID = 'HowTo'

/** Duration from the scenario; frame size from the form factor's layout. */
const calculateMetadata: CalculateMetadataFunction<HowToVideoProps> = ({
  props,
}) => {
  const scenario = getScenario(props.scenarioId)
  const layout = LAYOUTS[props.format]
  return {
    fps: scenario.fps,
    durationInFrames: Math.round(scenario.durationSec * scenario.fps),
    width: layout.width,
    height: layout.height,
  }
}

export function Root(): ReactElement {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={HowToVideo}
      width={LAYOUTS.desktop.width}
      height={LAYOUTS.desktop.height}
      fps={30}
      durationInFrames={30 * 30}
      defaultProps={
        {
          scenarioId: 'v2',
          format: 'desktop',
          manifest: null,
        } as HowToVideoProps
      }
      calculateMetadata={calculateMetadata}
    />
  )
}
