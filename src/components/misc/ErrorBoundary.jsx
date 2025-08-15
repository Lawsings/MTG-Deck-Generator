import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={ hasError:false, error:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, error }; }
  componentDidCatch(err, info){ console.error("ErrorBoundary", err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:16}}>
          <h2>Oups, une erreur est survenue.</h2>
          <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
