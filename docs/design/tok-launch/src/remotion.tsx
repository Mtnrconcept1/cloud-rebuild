import {AbsoluteFill, Composition, Img, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ImageContext, Scene, WIDTH, HEIGHT} from './Scene';
import {frameRemaining} from './countdown';
export function TokLaunch({portrait = false}: {portrait?: boolean}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  return <AbsoluteFill style={{background: '#ef7900'}}><div style={{transformOrigin: '0 0', transform: `scale(${width / (portrait ? 900 : WIDTH)}, ${height / (portrait ? 1600 : HEIGHT)})`}}>
    <ImageContext.Provider value={Img}><Scene portrait={portrait} time={frame / fps} remaining={frameRemaining(frame, fps)} previousRemaining={frameRemaining(Math.max(0, frame - frame % fps - 1), fps)}
      tickProgress={(frame % fps) / fps} assetBase={staticFile('assets')}/></ImageContext.Provider>
  </div></AbsoluteFill>;
}
function Root() {
  return <><Composition id="TokLaunch" component={TokLaunch} durationInFrames={630} fps={30} width={1920} height={1080}/><Composition id="TokLaunchMobile" component={TokLaunch} defaultProps={{portrait: true}} durationInFrames={630} fps={30} width={1080} height={1920}/></>;
}
registerRoot(Root);
