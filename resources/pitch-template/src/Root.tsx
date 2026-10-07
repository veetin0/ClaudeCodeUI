import { Composition } from 'remotion'
import script from '../script.json'
import { Pitch } from './Pitch'
import { FPS, sceneFrames, type Script } from './timing'

const initial = script as unknown as Script

export const RemotionRoot = () => (
  <Composition
    id="Pitch"
    component={Pitch}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={FPS * 10}
    defaultProps={{ script: initial }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(FPS, props.script.scenes.reduce((t, s) => t + sceneFrames(s, props.script.voiceId), 0)),
    })}
  />
)
