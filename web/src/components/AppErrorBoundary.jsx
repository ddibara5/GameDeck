import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('GameDeck render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <p className="auth-kicker">GameDeck hit a problem</p>
          <h1>That screen could not open</h1>
          <p className="auth-copy">Reload the app to retry. Your library and ranking data are still safe in the database.</p>
          <button type="button" className="auth-button" onClick={() => window.location.reload()}>Reload GameDeck</button>
        </section>
      </main>
    )
  }
}
