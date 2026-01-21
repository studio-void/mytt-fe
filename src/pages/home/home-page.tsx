import { Button, Layout } from '@/components';

export const HomePage: React.FC = () => {
  return (
    <Layout disableHeaderHeight>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-4xl font-bold mb-4">Welcome to the Home Page</h1>
        <p className="text-lg mb-6">This is a simple home page example.</p>
        <Button>Click Me!</Button>
      </div>
    </Layout>
  );
};
