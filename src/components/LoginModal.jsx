import { Link, useNavigate } from 'react-router-dom'

export default function LoginModal({ onClose }) {
  const nav = useNavigate()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Login required</h3>
        <p>Sign in to like, roast, and post your pics.</p>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <Link to="/auth" onClick={onClose} className="primary"
                style={{ flex: 1, padding: '10px', borderRadius: 8,
                         background: '#ff4d00', color: '#fff',
                         fontSize: 13, fontWeight: 500 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
