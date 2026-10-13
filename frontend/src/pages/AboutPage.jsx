import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BinderClip, Pencil, Pin } from '../components/Decor.jsx';
import Header from '../components/Header.jsx';
import { ArrowUpRight } from '../components/icons.jsx';

export default function AboutPage() {
  useEffect(() => {
    document.title = 'About us';
  }, []);

  return (
    <div className="page">
      <Header />

      <main className="subpage">
        <section className="sub-hero">
          <Pencil className="sub-pencil sub-pencil--left" />
          <Pencil className="sub-pencil sub-pencil--right" />
          <Pin className="sub-pin" />

          <div className="sub-hero-copy">
            <p className="eyebrow">About us</p>
            <h1>Find the Right Professors. Discover Research Opportunities. Take the Next Step.</h1>
          </div>
        </section>

        <div className="sub-body">
          <article className="panel prose">
            <p>
              We’re a group of students who understand how challenging it can be to find the right
              research opportunities. Searching across university websites, scattered directories, and
              outdated contact pages can take hours, often without leading anywhere.
            </p>
            <p className="prose-highlight">
              That’s why we’re building a platform that brings{' '}
              <strong>
                professor profiles, research interests, and academic contact information together in one place
              </strong>{' '}
              — helping students spend less time searching and more time pursuing meaningful research
              opportunities.
            </p>
            <p>
              Whether you&apos;re looking for a research internship, exploring a new field, or preparing for
              higher studies, our platform helps you discover relevant researchers and take the first step
              toward academic collaboration.
            </p>
          </article>

          <section className="band" aria-labelledby="built-by">
            <BinderClip className="band-clip" />
            <h2 id="built-by">Built by Students. For Students.</h2>
            <div className="band-text">
              <p>
                We believe that discovering research opportunities shouldn&apos;t depend on who you know or
                where you study. Every curious student deserves a fair chance to connect with researchers,
                explore new ideas, and contribute to meaningful work.
              </p>
              <p>
                Our goal is to make academic discovery simpler, more accessible, and more approachable for
                students everywhere.
              </p>
            </div>
          </section>

          <section className="cta" aria-labelledby="cta-title">
            <h2 id="cta-title">Your Next Research Opportunity Starts Here.</h2>
            <p>Discover professors in your field, explore their work, and find the right people to reach out to.</p>
            <p className="cta-line">Stop searching everywhere. Start discovering smarter.</p>
            <Link className="btn cta-btn" to="/#search">
              Get Started <ArrowUpRight width={18} height={18} />
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
