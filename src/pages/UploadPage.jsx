import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { createPost } from '../services/db.js'
import { uploadToCloudinary } from '../cloudinary.js'
import { colorFromString } from '../utils.js'

export default function UploadPage() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [stage, setStage] = useState('idle') // idle | uploading | posting
  const [error, setError] = useState('')

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 8 * 1024 * 1024) {
      setError('Image too large (max 8MB).')
      return
    }
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return
    if (!file) { setError('Pick a photo first.'); return }
    if (!caption.trim()) { setError('Add a caption.'); return }
    setError('')
    try {
      setStage('uploading')
      const imageUrl = await uploadToCloudinary(file)
      setStage('posting')
      await createPost({
        imageUrl,
        caption: caption.trim(),
        userId: user.uid,
        username: profile?.username || user.displayName || user.email?.split('@')[0],
        userAvatarColor: profile?.avatarColor || colorFromString(user.uid)
      })
      nav('/')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Upload failed.')
      setStage('idle')
    }
  }

  return (
    <div className="upload-screen">
      <div className="upload-title">Post your roast bait 🔥</div>

      <form onSubmit={handleSubmit}>
        <label className="upload-preview">
          {preview
            ? <img src={preview} alt="preview" />
            : <>
                <i className="ti ti-photo-plus"></i>
                <span>Tap to pick / take a photo</span>
                <input type="file" accept="image/*" onChange={handleFile} />
              </>}
          {preview && (
            <input
              type="file" accept="image/*"
              onChange={handleFile}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          )}
        </label>

        <textarea
          className="upload-caption"
          placeholder="Write a caption... anything goes, everything gets roasted 😂"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          maxLength={200}
        />

        {error && <div className="auth-error">{error}</div>}
        {stage !== 'idle' && (
          <div className="upload-progress">
            {stage === 'uploading' ? 'Uploading image…' : 'Posting…'}
          </div>
        )}

        <button
          className="upload-submit"
          type="submit"
          disabled={stage !== 'idle'}
        >
          {stage === 'idle' ? 'Drop the roast 🔥' : 'Please wait…'}
        </button>
      </form>
    </div>
  )
}
