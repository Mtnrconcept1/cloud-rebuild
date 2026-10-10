import {AbsoluteFill, Composition, Img, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ImageContext, Scene, WIDTH, HEIGHT} from './Scene';
import {frameRemaining} from './countdown';
export function TokLaunch() {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  return <AbsoluteFill style={{background: '#ef7900'}}><div style={{transformOrigin: '0 0', transform: `scale(${width / WIDTH}, ${height / HEIGHT})`}}>
    <ImageContext.Provider value={Img}><Scene time={frame / fps} remaining={frameRemaining(frame, fps)} previousRemaining={frameRemaining(Math.max(0, frame - frame % fps - 1), fps)}
      tickProgress={(frame % fps) / fps} assetBase={staticFile('assets')}/></ImageContext.Provider>
  </div></AbsoluteFill>;
}
function Root() {
  return <Composition id="TokLaunch" component={TokLaunch} durationInFrames={630} fps={30} width={1920} height={1080}/>;
}
registerRoot(Root);
