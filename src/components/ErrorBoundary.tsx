import { Component, type ErrorInfo, type ReactNode } from "react";
import { Logo } from "./Icon";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("InkNote runtime error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot-screen boot-error">
        <Logo size={46} />
        <h1>界面遇到了一点问题</h1>
        <p>笔记文件仍然安全地保存在本地。重新载入通常可以继续工作。</p>
        <button className="button solid" onClick={() => window.location.reload()}>
          重新载入
        </button>
        <details className="boot-details">
          <summary>查看错误详情</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </div>
    );
  }
}
