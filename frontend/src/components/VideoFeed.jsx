export default function VideoFeed({ src }) {
  return (
    <div className="video-wrap">
      <img id="video" src={src} alt="Live feed" />
    </div>
  )
}
