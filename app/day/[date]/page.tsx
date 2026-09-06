export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return <div className="py-8">Day {date}</div>;
}
