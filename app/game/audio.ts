export type SoundName = "start"|"dash"|"shot"|"hit"|"hurt"|"pickup"|"level"|"boss"|"heart"|"win"|"lose";

export function createSoundEngine(){
  let audio:AudioContext|null=null,muted=false,music:HTMLAudioElement|null=null;
  const startMusic=()=>{
    music??=new Audio("/audio/circuit-bloom.ogg");
    music.loop=true;music.preload="auto";music.volume=.22;music.muted=muted;
    if(music.paused)void music.play().catch(()=>{});
  };
  const last:Partial<Record<SoundName,number>>={};
  const play=(name:SoundName)=>{
    if(muted)return;
    const now=performance.now(),gaps:Partial<Record<SoundName,number>>={shot:85,hit:55,pickup:70,hurt:180};
    if(now-(last[name]??0)<(gaps[name]??0))return;last[name]=now;
    audio??=new AudioContext();if(audio.state==="suspended")void audio.resume();
    const tones:Record<SoundName,[number,number,number,"sine"|"square"|"sawtooth"|"triangle"]>={
      start:[180,360,.3,"sine"],dash:[420,110,.16,"sawtooth"],shot:[310,190,.07,"square"],
      hit:[95,55,.055,"square"],hurt:[150,62,.2,"sawtooth"],pickup:[520,920,.11,"sine"],
      level:[330,990,.42,"triangle"],boss:[72,42,.7,"sawtooth"],heart:[85,62,.28,"sine"],
      win:[380,1180,.75,"triangle"],lose:[180,48,.8,"sawtooth"],
    };
    const [from,to,duration,wave]=tones[name],osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(from,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),audio.currentTime+duration);
    gain.gain.setValueAtTime((name==="boss"||name==="hurt") ? .1 : .055,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);
    osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
  };
  const setMuted=(value:boolean)=>{muted=value;if(music)music.muted=value;if(audio)void (value?audio.suspend():audio.resume())};
  const pauseMusic=()=>{music?.pause()};
  const resumeMusic=()=>{if(music&&!muted)void music.play().catch(()=>{})};
  const stopMusic=()=>{if(music){music.pause();music.currentTime=0}};
  return {play,setMuted,startMusic,pauseMusic,resumeMusic,stopMusic};
}
